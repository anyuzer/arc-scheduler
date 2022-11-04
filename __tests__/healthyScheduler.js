import {jest} from '@jest/globals';
import ArcDate from "arc-date";
import ArcScheduler from "../src/index.js";

jest.setTimeout(25000);

//These are happy path tests. Set your tasks, everything goes splendily
describe('ArcScheduler, running jobs in a healthy environment',()=>{
    let TestScheduler, TestTask;

    it('Check the current repeatInterval of a Task',async ()=>{
        //Create a new scheduler
        TestScheduler = new ArcScheduler();
        expect(TestScheduler.getNewTask('test').getRepeatInterval()).toBe(86400*1000)
    });

    it('Run the clock, no tasks',async ()=>{
        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Simulate 5 minutes. No tasks
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 1,1, 5),
        );

        expect(TestScheduler.getTasks().length).toBe(0);
        expect(TestScheduler.formatNow('Y-m-d h:i')).toBe('2020-01-01 01:05');
        expect(TestScheduler.getMode()).toBe(ArcScheduler.MODE_SIMULATION);

        TestScheduler.setTimezone('Africa/Abidjan')
        expect(TestScheduler.getTimezone()).toBe('Africa/Abidjan');
    });

    it('Should fire a task immediately, and not repeat it',async ()=>{
        expect.assertions(2);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Set repeat to false, and tell it to fire immediately
        TestTask.setRepeat(false).setFireOnStart(true);

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date).toBeInstanceOf(ArcDate);
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //This will hit a few lines of code by setting a task without a job, it will be skipped (but remain as a potential task to be evaluated)
        TestScheduler.scheduleTask(TestScheduler.getNewTask('testTask2').setMonthsOfYear([11]));

        //Simulate 5 minutes
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 1,1, 5),
        );

        expect(TestScheduler.getTasks().length).toBe(1);
    });

    it('Should allow us to set the run history for a task, and it should respect that',async ()=>{
        expect.assertions(1);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Tell it to run at noon
        TestTask.setTimeOfDay(12);

        //Set a fake lastRunTime and tell it that it can't run until the next day
        TestTask.setRunHistory(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 2)
        );

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date.formatLocal('M-j|H:i')).toBe('Jan-2|12:01');
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 2 days
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 3),
            ArcScheduler.MINUTE
        );
    });

    it('Should fire every 5 minutes in perpetuity',async ()=>{
        expect.assertions(12);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Set repeat to false, and tell it to fire immediately
        TestTask.setRepeatInterval(0, 5).setFireOnStart(true);

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date).toBeInstanceOf(ArcDate);
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 5 minutes
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 1, 1,1),
        );
    });

    it('Should fire on the first monday of the month every month at noon',async ()=>{
        expect.assertions(2);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Set weeks of month (in this case 1st week), days of week (no sunday, yes monday), time of day (hour 12 of 24 hour clock)
        TestTask.setWeeksOfMonth(1).setDaysOfWeek(0,1).setTimeOfDay(12);

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date.formatLocal('D|H:i')).toBe('Mon|12:00');
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 6 weeks
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 1, 1),
            TestScheduler.getSimTargetTimestamp(2020, 2, 15),
            ArcScheduler.HOUR
        );
    });

    it('Should fire monday, tuesday at 8:09am',async ()=>{
        expect.assertions(2);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Set days of week, time of day
        TestTask.setDaysOfWeek(0,1,1).setTimeOfDay(8,9);

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date.formatLocal('H:i')).toBe('8:09');
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 6 weeks
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2022, 2, 13),
            TestScheduler.getSimTargetTimestamp(2022, 2, 16),
            ArcScheduler.MINUTE
        );
    });

    it('Run 8am on christmas',async ()=>{
        expect.assertions(1);

        //Create a new scheduler
        TestScheduler = new ArcScheduler();

        //Get a new task
        TestTask = TestScheduler.getNewTask('testTask1');

        //Set weeks of month (in this case 1st week), days of week (no sunday, yes monday), time of day (hour 12 of 24 hour clock)
        TestTask.setMonthsOfYear([12]).setDaysOfMonth([25]).setTimeOfDay(8);

        //Set the job to actually run
        TestTask.setJob(async (_Date) => {
            expect(_Date.formatLocal('M-j|H:i')).toBe('Dec-25|8:00');
        });

        //Schedule it
        TestScheduler.scheduleTask(TestTask);

        //Simulate 6 weeks
        await TestScheduler.startSimulated(
            TestScheduler.getSimTargetTimestamp(2020, 11, 1),
            TestScheduler.getSimTargetTimestamp(2021, 1, 2),
            ArcScheduler.HOUR
        );
    });

    it('Start and run a real clock for 5 seconds and then stop', (done)=>{
        expect.assertions(5);

        let calls = 0;
        //Create a new scheduler
        TestScheduler = new ArcScheduler();
        TestScheduler.on(ArcScheduler.INTERVAL_SECONDS_1, (_Date) => {
            calls++;
            expect(_Date).toBeTruthy();
            if(calls >= 5) {
                TestScheduler.stop();
                done();
            }
        })

        TestScheduler.startRealTime();
    });
});