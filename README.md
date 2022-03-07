# arc-scheduler
A functional scheduler that enables easy functional task bindings.

## Install & Testing
```
$ npm install arc-scheduler --save
$ npm run test
```

## Features
* A clock to easily listen for events to schedule jobs around (ie. NEW_DAY or NEW_WEEK)
* A task system to easily schedule recurrent tasks and specific times (ie. First Monday, 12:00pm of the month)
* A task queue to make unpredictable states less catastrophic (ie. limit jobs in queue, prevent duplicate jobs from being added to queue)
* Supports task persistence (ie. if your service fails, rehydrate tasks with data to ensure they continue to behave as expected)
* A full simulation mode to enable testing real world behavior over time

## Basic Events Usage

```js
const ArcScheduler = require('arc-scheduler');

//Create a new scheduler
const TestScheduler = new ArcScheduler();

TestScheduler.on(ArcScheduler.EVENT_NEW_DAY, ()=>{
    //Do things when it's a new day!
})

//Start the scheduler
TestScheduler.startRealTime();
```

## Basic Tasks Usage

```js
const ArcScheduler = require('arc-scheduler');

//Create a new scheduler
const TestScheduler = new ArcScheduler();

//Get a new task
const TestTask = TestScheduler.getNewTask('testTask1');

//Set the job to actually run
TestTask.setJob(async (_ArcDate) => {
    //Do something
});

//Fire immediately, and then fire every five minutes in perpetuity
TestTask.setFireOnStart(true).setRepeatInterval(0, 5)

//Schedule it
TestScheduler.scheduleTask(TestTask);

//Start the scheduler
TestScheduler.startRealTime();
```

## API

*TODO: Fill in the API. For now refer to the healthyScheduler.js in the \__tests__ folder to see usage patterns. Refer to the unhealthyScheduler.js in the \__tests__ folder to see queueDepth management.*

## NOTES:

This system has two primary concepts. Exclusion filters (ie. check for configurations set, and identify when NOT to run), and then a repeat interval (ie. after a job CAN run, identify an interval before it can run again). By default the `repeatInterval` value is set to one day. In effect, when you consider the following:

```js
    //Set days of week, time of day
    TestTask.setDaysOfWeek(0,1,1).setTimeOfDay(8,9);
```

Every day the scheduler will check to see if it meets the exclusion criteria (is it Monday/Tuesday?). Assuming it's Monday, it will fire the job, and then use the repeatInterval to identify the minimum delay before the job can fire again. By default 24 hours later.

This keeps things relatively simple, regarding the flexibility of timing of when a job can fire based on  cirucmstances (ie. if a queue is full, or a previous job is blocking, the job is comfortable at firing as close to 8:09 as possible, which may in fact be... 8:30). It **_can_** however introduce some unexpected behaviors.

For example, if you schedule a job to happen at the last second of the day (23:59:59) and it misses that window, it may now meet the exclusion criteria of the next day and not fire at all. Or, if you reduce the repeat interval to say 6 hours, and a job starts firing at 8:00, it would also fire at 14:00 and 20:00.

Or, if you try to set the `repeatInterval` to say one week, after it fires the first job, even if you have it set to fire on different days of the week, it will wait a week before being eligible again.

There are ways around this, and I might eventually get annoyed and rework this approach, but for now the simplicity of the API, with consistent behavior seemed to do the trick.