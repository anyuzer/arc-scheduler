const ArcEvents = require('arc-events');
const ArcDate = require('arc-date');

const TaskConfig = require('./TaskConfig');

class ArcScheduler {
    static get INTERVAL_SECONDS_1(){ return 's1'; }
    static get INTERVAL_SECONDS_5() { return 's5'; }
    static get INTERVAL_SECONDS_30() { return 's30'; }
    static get INTERVAL_MINUTES_1() { return 'm1'; }
    static get INTERVAL_MINUTES_4() { return 'm4'; }
    static get INTERVAL_MINUTES_5() { return 'm5'; }
    static get INTERVAL_MINUTES_30() { return 'm30'; }
    static get INTERVAL_HOURS_1() { return 'h1'; }
    static get INTERVAL_HOURS_3() { return 'h3'; }
    static get INTERVAL_HOURS_5() { return 'h5'; }
    static get INTERVAL_HOURS_6() { return 'h6'; }
    static get INTERVAL_HOURS_12() { return 'h12'; }
    static get INTERVAL_DAYS_1() { return 'd1'; }
    static get INTERVAL_DAYS_2() { return 'd2'; }
    static get INTERVAL_DAYS_3() { return 'd3'; }
    static get INTERVAL_DAYS_4() { return 'd4'; }
    static get INTERVAL_DAYS_5() { return 'd5'; }
    static get INTERVAL_DAYS_6() { return 'd6'; }
    static get INTERVAL_DAYS_7() { return 'd7'; }

    static get MODE_REALTIME() { return 'realtime'; }
    static get MODE_SIMULATION() { return 'simulation'; }

    static get SECOND() { return 1000; }
    static get MINUTE() { return ArcScheduler.SECOND * 60; }
    static get HOUR() { return ArcScheduler.SECOND * 60 * 60 }
    static get DAY() { return ArcScheduler.HOUR * 24 }

    static get EVENT_NEW_HOUR() { return 'newHour' };
    static get EVENT_NEW_DAY() { return 'newDay' };
    static get EVENT_NEW_WEEK() { return 'newWeek' };
    static get EVENT_NEW_MONTH() { return 'newMonth' };
    static get EVENT_NEW_YEAR() { return 'newYear' };

    static get WARNING_QUEUE_DEPTH() { return 'queueDepth'; }
    static get WARNING_QUEUE_LIMIT() { return 'queueLimit'; }
    static get WARNING_DUPLICATE_TASK() { return 'duplicateTask'; }

    constructor(){
        ArcEvents.mixin(this);
        this.mode = ArcScheduler.MODE_REALTIME;
        this.intervals = {};
        this.clock = undefined;
        this.simulation = 0;
        this.endSimulation = 0;
        this.simulationIncrement = ArcScheduler.MINUTE;
        this.lastTick = new ArcDate;
        this.timezone = 'America/Vancouver';

        this.tasks = [];
        this.taskQueue = [];

        this.taskRunning = false;
        this.taskRunningId = '';

        this.configAcceptDuplicateTasks = false;
        this.configAcceptableQueueDepth = 10;
        this.queueWarningBounce = 0;
    }

    getNewTask(_id, _lastRunTime) {
        return new TaskConfig(this, _id, _lastRunTime);
    }

    getTasks() {
        return this.tasks;
    }

    getTimezone() {
        return this.timezone;
    }

    getMode(){
        return this.mode;
    }

    getSimTargetTimestamp(_year, _month, _day, _hour=0, _minute=0, _second=0) {
        return ArcDate.target(this.timezone, Date.UTC(_year, _month-1,_day, _hour, _minute, _second)).getTime();
    }

    setQueueConfig(_acceptDuplicateTasks, _acceptableQueueDepth) {
        this.configAcceptDuplicateTasks = !!_acceptDuplicateTasks;
        this.configAcceptableQueueDepth = _acceptableQueueDepth || this.configAcceptableQueueDepth;
    }

    //What if this returned an API that you configured?
    scheduleTask(_TaskConfig) {
        if(!_TaskConfig.getNextRunnableTime()){
            _TaskConfig.incrementNextRunnableTime(this.now());
        }
        this.tasks.push(_TaskConfig);
    }

    setTimezone(_timezone) {
        this.timezone = _timezone;
    }

    startRealTime() {
        this.mode = ArcScheduler.MODE_REALTIME;
        this._setIntervals(Date.now());
        this.lastTick = new ArcDate();
        this.clock = setInterval(this._handleIncrement.bind(this), 250);
    }

    async startSimulated(_beginningTimestamp, _endTimestamp, _simulationIncrement, _simulationInterval) {
        //I made this async, for ease of testing.
        let resolveSimulation;
        const simPromise = new Promise((_resolve) => {
            resolveSimulation = _resolve;
        });

        this.on('SimulationFinished', () => {
            resolveSimulation(true);
        })

        this.simulationIncrement = _simulationIncrement || ArcScheduler.MINUTE;
        this.mode = ArcScheduler.MODE_SIMULATION;
        this.lastTick = new ArcDate(_beginningTimestamp);
        this._setIntervals(_beginningTimestamp);
        this.simulation = _beginningTimestamp;
        this.endSimulation = _endTimestamp;
        this.clock = setInterval(this._handleIncrement.bind(this), _simulationInterval || 0);

        return simPromise;
    }

    stop() {
        clearInterval(this.clock);
        this.clock = undefined;
    }

    now(){
        return (this.mode === ArcScheduler.MODE_SIMULATION ? this.simulation : Date.now());
    }

    formatNow(_formatStr, _tz) {
        return (new ArcDate(this.now())).format(_formatStr, _tz || this.timezone);
    }

    dateFactory(_now) {
        const NowDate = new ArcDate(_now || this.now());
        NowDate.setTZ(this.timezone);
        return NowDate;
    }

    //Private methods
    _handleQueue() {
        if(!this.taskQueue.length){
            //Task queue is empty
            return;
        }

        if(this.taskRunning) {
            //We have an actively processing task. We don't want to allow task stacking
            return;
        }

        //Otherwise set our task to running
        this.taskRunning = true;

        //Fire and forget so we don't block
        this._runNextTask();
    }

    async _runNextTask() {
        //Take a Task from our TaskQueue
        const Task = this.taskQueue.shift();

        //Set our runningId so we can see if jobs are piling up.
        this.taskRunningId = Task.getId();

        //Our trigger job is a try/catch that emits when it's finished (either success or failure), so we don't need to be defensive here.
        await Task.triggerJob();

        //Once it has completed running (success or failure), we look to see if it repeats. If it does not, we remove it from our tasks list.
        if(!Task.getRepeat()) {
            //So, if the Task doesn't repeat, we will just reduce the tasks without any Task that matches this ID
            this.tasks = this.tasks.reduce((_tasks, _Task) => {
                if(_Task === Task) {
                    return _tasks;
                }
                _tasks.push(_Task);
                return _tasks;
            }, [])
        }

        //Once we're done, we ready ourselves for the next job
        this.taskRunning = false;
        this.taskRunningId = false;
    }

    _handleIncrement() {
        //Handle our task queue
        this._handleQueue();

        const now = this.now();

        //We do a non blocking emit
        // this.emit('tick', [this.dateFactory(now)]);

        //Seven Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_7] <= now-(ArcScheduler.DAY*7)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_7] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_7, [this.dateFactory(now)]);
        }

        //Six Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_6] <= now-(ArcScheduler.DAY*6)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_6] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_6, [this.dateFactory(now)]);
        }

        //Five Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_5] <= now-(ArcScheduler.DAY*5)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_5] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_5, [this.dateFactory(now)]);
        }

        //Four Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_4] <= now-(ArcScheduler.DAY*4)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_4] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_4, [this.dateFactory(now)]);
        }

        //Three Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_3] <= now-(ArcScheduler.DAY*3)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_3] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_3, [this.dateFactory(now)]);
        }

        //Two Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_2] <= now-(ArcScheduler.DAY*2)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_2] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_2, [this.dateFactory(now)]);
        }

        //One Day
        if(this.intervals[ArcScheduler.INTERVAL_DAYS_1] <= now-(ArcScheduler.DAY)){
            this.intervals[ArcScheduler.INTERVAL_DAYS_1] = now;
            this.emit(ArcScheduler.INTERVAL_DAYS_1, [this.dateFactory(now)]);
        }

        //12 Hours
        if(this.intervals[ArcScheduler.INTERVAL_HOURS_12] <= now-(ArcScheduler.HOUR*12)){
            this.intervals[ArcScheduler.INTERVAL_HOURS_12] = now;
            this.emit(ArcScheduler.INTERVAL_HOURS_12, [this.dateFactory(now)]);
        }

        //6 Hours
        if(this.intervals[ArcScheduler.INTERVAL_HOURS_6] <= now-(ArcScheduler.HOUR*6)){
            this.intervals[ArcScheduler.INTERVAL_HOURS_6] = now;
            this.emit(ArcScheduler.INTERVAL_HOURS_6, [this.dateFactory(now)]);
        }

        //5 Hours
        if(this.intervals[ArcScheduler.INTERVAL_HOURS_5] <= now-(ArcScheduler.HOUR*5)){
            this.intervals[ArcScheduler.INTERVAL_HOURS_5] = now;
            this.emit(ArcScheduler.INTERVAL_HOURS_5, [this.dateFactory(now)]);
        }

        //3 Hours
        if(this.intervals[ArcScheduler.INTERVAL_HOURS_3] <= now-(ArcScheduler.HOUR*3)){
            this.intervals[ArcScheduler.INTERVAL_HOURS_3] = now;
            this.emit(ArcScheduler.INTERVAL_HOURS_3, [this.dateFactory(now)]);
        }


        //1 Hours
        if(this.intervals[ArcScheduler.INTERVAL_HOURS_1] <= now-(ArcScheduler.HOUR)) {
            this.intervals[ArcScheduler.INTERVAL_HOURS_1] = now;
            this.emit(ArcScheduler.INTERVAL_HOURS_1, [this.dateFactory(now)]);
        }

        //30 Minutes
        if(this.intervals[ArcScheduler.INTERVAL_MINUTES_30] <= now-(ArcScheduler.MINUTE*30)) {
            this.intervals[ArcScheduler.INTERVAL_MINUTES_30] = now;
            this.emit(ArcScheduler.INTERVAL_MINUTES_30, [this.dateFactory(now)]);
        }

        //5 Minutes
        if(this.intervals[ArcScheduler.INTERVAL_MINUTES_5] <= now-(ArcScheduler.MINUTE*5)) {
            this.intervals[ArcScheduler.INTERVAL_MINUTES_5] = now;
            this.emit(ArcScheduler.INTERVAL_MINUTES_5, [this.dateFactory(now)]);
        }

        //4 Minutes
        if(this.intervals[ArcScheduler.INTERVAL_MINUTES_4] <= now-(ArcScheduler.MINUTE*4)) {
            this.intervals[ArcScheduler.INTERVAL_MINUTES_4] = now;
            this.emit(ArcScheduler.INTERVAL_MINUTES_4, [this.dateFactory(now)]);
        }

        //1 Minutes
        if(this.intervals[ArcScheduler.INTERVAL_MINUTES_1] <= now-(ArcScheduler.MINUTE)) {
            this.intervals[ArcScheduler.INTERVAL_MINUTES_1] = now;
            this.emit(ArcScheduler.INTERVAL_MINUTES_1, [this.dateFactory(now)]);
        }

        //30 Seconds
        if(this.intervals[ArcScheduler.INTERVAL_SECONDS_30] <= now-(ArcScheduler.SECOND*30)) {
            this.intervals[ArcScheduler.INTERVAL_SECONDS_30] = now;
            this.emit(ArcScheduler.INTERVAL_SECONDS_30, [this.dateFactory(now)]);
        }

        //5 Seconds
        if(this.intervals[ArcScheduler.INTERVAL_SECONDS_5] <= now-(ArcScheduler.SECOND*5)) {
            this.intervals[ArcScheduler.INTERVAL_SECONDS_5] = now;
            this.emit(ArcScheduler.INTERVAL_SECONDS_5, [this.dateFactory(now)]);
        }

        //1 Second
        if(this.intervals[ArcScheduler.INTERVAL_SECONDS_1] <= now-(ArcScheduler.SECOND)) {
            this.intervals[ArcScheduler.INTERVAL_SECONDS_1] = now;
            this.emit(ArcScheduler.INTERVAL_SECONDS_1, [this.dateFactory(now)]);
        }

        const currentTick = this.dateFactory(now);
        const targetTZ = this.timezone;
        if(this.lastTick.format('G', targetTZ) !== currentTick.format('G', targetTZ)){
            this.emit(ArcScheduler.EVENT_NEW_HOUR, [this.dateFactory(now)]);
        }

        if(this.lastTick.format('j', targetTZ) !== currentTick.format('j', targetTZ)){
            this.emit(ArcScheduler.EVENT_NEW_DAY, [this.dateFactory(now)]);
        }

        if(this.lastTick.format('W', targetTZ) !== currentTick.format('W', targetTZ)){
            this.emit(ArcScheduler.EVENT_NEW_WEEK, [this.dateFactory(now)]);
        }

        if(this.lastTick.format('n', targetTZ) !== currentTick.format('n', targetTZ)){
            this.emit(ArcScheduler.EVENT_NEW_MONTH, [this.dateFactory(now)]);
        }

        if(this.lastTick.format('Y', targetTZ) !== currentTick.format('Y', targetTZ)){
            this.emit(ArcScheduler.EVENT_NEW_YEAR, [this.dateFactory(now)]);
        }

        this._checkForNewTasks(now);

        this.lastTick = this.dateFactory(now);

        if(this.mode === ArcScheduler.MODE_SIMULATION) {
            this.simulation += this.simulationIncrement; //By default this is ArcScheduler.MINUTE
            if(this.simulation >= this.endSimulation){
                clearInterval(this.clock);
                this.emit('SimulationFinished', ['SIMULATION FINISHED']);
            }
        }
    }

    _checkForNewTasks(_now) {
        if(!this.tasks.length) {
            //No tasks have been added. Great.
            return;
        }

        const nowFormat = this.dateFactory(_now);

        //Otherwise, let's go through our tasks and evaluate
        for(let t=0;t<this.tasks.length;t++) {
            const task = this.tasks[t];

            if(!task.getJob()){
                //If there is a task without a job, we skip it
                continue;
            }

            const lastRunTime = task.getLastRunTime();

            //If we DO NOT accept duplicate tasks check for them
            if(!this.configAcceptDuplicateTasks) {
                let isDuplicateTask = false;
                for(let q=0;q<this.taskQueue.length;q++) {
                    if(this.taskQueue[q].getId() === task.getId()) {
                        isDuplicateTask = true;
                        break;
                    }
                }

                if(this.taskRunning && task.getId() === this.taskRunningId) {
                    isDuplicateTask = true;
                }

                if(isDuplicateTask) {
                    //We identified we have a duplicate task (which are configured to not accept). Skip evaluating it.
                    this.emit(ArcScheduler.WARNING_DUPLICATE_TASK, [task.getId(), this.taskRunningId])
                    continue;
                }
            }

            //So, first let's check to see if it has fireOnStart AND has never run
            if(task.getFireOnStart() && !lastRunTime) {
                task.incrementNextRunnableTime(_now);
                this.taskQueue.push(task);
                continue;
            }

            //So, if the task has been run AND our current time is less than the next runnable time
            if(lastRunTime && _now < task.getNextRunnableTime()) {
                //If there hasn't been enough time since last run, skip.
                // console.log('Hit here???', _now, task.getNextRunnableTime());
                continue;
            }
            // console.log('!!!');

            //So, if month of year is set AND those months DO NOT include our current month, skip
            if(task.getMonthsOfYear() && !task.getMonthsOfYear().includes(+nowFormat.format('n', this.timezone))) {
                continue;
            }

            //So, if weeks of month is set AND the current week is not one of those weeks, skip
            if(task.getWeeksOfMonth()) {
                const monthlyWeekTargets = task.getWeeksOfMonth();
                const dayOfMonth = nowFormat.format('j', this.timezone);
                const currentWeekOfMonth = Math.ceil(dayOfMonth/7);

                //We set our array index to true/false for 1/2/3/4. If our current week is not one of those weeks, skip.
                if(!monthlyWeekTargets[currentWeekOfMonth]) {
                    continue;
                }
            }

            //If days of week is set AND the current day is not one of those days, skip
            if(task.getDaysOfWeek()) {
                const weeklyDayTargets = task.getDaysOfWeek();
                const currentDayOfWeek = nowFormat.format('N', this.timezone);
                //Our array index is true/false for 1/2/3/4/5/6/7 if our current day of the week is not one of those days, skip
                if(!weeklyDayTargets[currentDayOfWeek]) {
                    continue;
                }
            }

            //If our days of month is set AND the current day is not one of those days
            if(task.getDaysOfMonth() && !task.getDaysOfMonth().includes(+nowFormat.format('j', this.timezone))) {
                continue;
            }

            if(task.getTimeOfDay()) {
                //Our time of day is hour/minute.
                const [targetHour, targetMinute] = task.getTimeOfDay();

                //If our current hour is less than the set hour, safe to skip
                if(nowFormat.format('G', this.timezone) < targetHour) {
                    continue;
                }

                //If our current minute is less than the set minute, safe to skip
                if(+nowFormat.format('i', this.timezone) < targetMinute) {
                    continue;
                }
            }

            //ConfigAcceptableQueueDepth is always set
            if(this.configAcceptableQueueDepth <= this.taskQueue.length) {
                //We are at our maximum queue depth. Do not add the job.
                if(this.queueWarningBounce && this.queueWarningBounce > _now) {
                    //We don't want to start firing a million warnings every second. Give it a minute per warning
                    continue;
                }

                //Fire our warning
                this.queueWarningBounce = _now+ArcScheduler.MINUTE;
                this.emit(ArcScheduler.WARNING_QUEUE_LIMIT, [1]);
                continue;
            }

            //We do fire a warning with each job being added as we exceed 70% of our queue limit.
            if(((this.taskQueue.length+1)/this.configAcceptableQueueDepth) >= 0.7) {
                this.emit(ArcScheduler.WARNING_QUEUE_DEPTH, [((this.taskQueue.length+1)/this.configAcceptableQueueDepth)]);
            }

            //At this point in time, we increment the nextRunnableTime for the task regardless of when the task runs. This keeps us on schedule
            task.incrementNextRunnableTime(this.now());

            //At this point in time, we're good to add a new job to the queue
            this.taskQueue.push(task);
        }
    }

    _setIntervals(_timestamp) {
        //Our random timestamps here ensure we aren't likely to have a lot of trigger overlap.
        this.intervals[ArcScheduler.INTERVAL_SECONDS_1] = _timestamp;
        this.intervals[ArcScheduler.INTERVAL_SECONDS_5] = _timestamp;
        this.intervals[ArcScheduler.INTERVAL_SECONDS_30] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_MINUTES_1] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_MINUTES_4] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_MINUTES_5] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_MINUTES_30] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_HOURS_1] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_HOURS_3] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_HOURS_5] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_HOURS_6] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_HOURS_12] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_1] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_2] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_3] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_4] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_5] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_6] = _timestamp+this._getRandomInt(60*1000);
        this.intervals[ArcScheduler.INTERVAL_DAYS_7] = _timestamp+this._getRandomInt(60*1000);
    }

    _getRandomInt(_max) {
        return Math.floor(Math.random() * _max);
    }
}

module.exports = ArcScheduler;