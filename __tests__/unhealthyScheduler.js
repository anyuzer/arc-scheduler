const ArcDate = require('arc-date');
const ArcScheduler = require('../src/index');

jest.setTimeout(25000);


const sleep = async (_for) => {
    return new Promise(resolve => setTimeout(resolve, _for));
}

//These are more complex failure state tests (ie. bad task results in stacked queue, etc)
describe('ArcScheduler, running jobs in an unhealthy environment',()=>{
    let TestScheduler, TestTask;

    it('Do not allow acceptableQueueDepth to be set to zero',async ()=>{
        //Create a new scheduler
        TestScheduler = new ArcScheduler();
        TestScheduler.setQueueConfig(true, 0);
        expect(TestScheduler.configAcceptableQueueDepth).toBeTruthy();
    });

    it('When queue depth is hit, additional jobs should not be added and a warning should be emitted',async ()=>{
        expect.assertions(9);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();
        TestScheduler.setQueueConfig(true, 5);

        TestScheduler.on(ArcScheduler.WARNING_QUEUE_DEPTH, (_depthPercent) => {
            //This will run 7 times (once for hitting 80%, 4 out of 5. Once for hitting 100%, and then 5 times for the other 7 jobs that complete)
            expect(_depthPercent).toBeGreaterThanOrEqual(0.7)
        });

        //Now, we should receive a warning when queueLimit is hit
        TestScheduler.on(ArcScheduler.WARNING_QUEUE_LIMIT, (_depthPercent) => {
            //This should run twice (as we debounce the spam)
            expect(_depthPercent).toBe(1);
        })

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Have a task that is added every second
        TestTask.setRepeatInterval(0,0,1);

        //But force the task to 25 simulated seconds to resolve
        TestTask.setJob(async (_Date) => {
            return sleep(250); //In this case, we would expect 8 jobs to successfully run
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 2 minutes, each second being 10ms (so 1200ms)
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 1,0, 2),
            ArcScheduler.SECOND,
            10
        );
    });

    it('Duplicate jobs should not be allowed (by default), even if they are in the queue',async ()=>{
        expect.assertions(14);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        TestScheduler.on(ArcScheduler.WARNING_DUPLICATE_TASK, (_duplicateId, _taskRunningId) => {
            expect(_taskRunningId).toEqual(TestScheduler.taskRunningId);
        })

        //Setup tasks
        TestTask = TestScheduler.getNewTask('testTask1');
        TestTask.setRepeatInterval(0,0,1);
        TestTask.setJob(async (_Date) => {
            return sleep(11);
        });

        const TestTask2 = TestScheduler.getNewTask('testTask2');
        TestTask2.setRepeatInterval(0,0,1);
        TestTask2.setJob(async (_Date) => {
            return sleep(11);
        });

        //Schedule them
        TestScheduler.scheduleTask(TestTask);
        TestScheduler.scheduleTask(TestTask2);

        //Simulate 2 minutes, each second being 10ms (so 1200ms)
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 1,0, 0, 10),
            ArcScheduler.SECOND,
            10
        );
    });

});