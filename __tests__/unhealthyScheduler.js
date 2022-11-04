import {jest} from '@jest/globals';
import ArcScheduler from "../src/index.js";

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
        expect.assertions(6);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();
        TestScheduler.setQueueConfig(true, 5);

        let increment = 0;
        TestScheduler.on(ArcScheduler.WARNING_QUEUE_DEPTH, (_depthPercent) => {
            //This will run 2 times (before limit is hit, while we're adding jobs), and then an additional 4 times, once each time a job completes while our simulation is running (5th job ends at 126 simulation seconds, and we're only simulating 120 seconds)
            increment++;
            expect(_depthPercent).toBeGreaterThanOrEqual(0.7)
        });

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Have a task that is added every second
        TestTask.setRepeatInterval(0,0,1);

        //But force the task to 25 simulated seconds to resolve
        TestTask.setJob(async (_Date) => {
            return sleep(250); //In this case, we would expect 5 jobs to successfully run (first job on second 1, 26, 51, 76, 101).
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