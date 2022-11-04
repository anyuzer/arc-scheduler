class TaskConfig {
    constructor(_Scheduler, _id, _lastRunTime) {
        this.Scheduler = _Scheduler;
        this.id = _id;
        this.repeatInterval = 86400*1000;
        this.repeat = true;
        this.lastRunTime = _lastRunTime || 0;
        this.nextRunnableTime = 0;
        this.runCount = 0;
        this.successfulRuns = 0;
        this.failedRuns = 0;
        this.weeklyDayTargets;
        this.monthlyWeekTargets;
        this.timeOfDay;
        this.daysOfMonth;
        this.monthsOfYear;
        this.fireOnStart;
        this.job;
    }

    getId() {
        return this.id;
    }

    getFireOnStart() {
        return this.fireOnStart;
    }

    getLastRunTime() {
        return this.lastRunTime;
    }

    getRepeatInterval() {
        return this.repeatInterval;
    }

    getMonthsOfYear() {
        return this.monthsOfYear;
    }

    getWeeksOfMonth() {
        return this.monthlyWeekTargets;
    }

    getDaysOfWeek() {
        return this.weeklyDayTargets;
    }

    getDaysOfMonth() {
        return this.daysOfMonth;
    }

    getTimeOfDay() {
        return this.timeOfDay;
    }

    getRepeat() {
        return this.repeat;
    }

    getJob() {
        return this.job;
    }

    getNextRunnableTime() {
        return this.nextRunnableTime;
    }

    incrementNextRunnableTime(_now) {
        this.nextRunnableTime = _now+this.repeatInterval;
    }

    async triggerJob() {
        this.setLastRunTime(this.Scheduler.now());
        this.runCount++;
        try{
            const response = await this.job(this.Scheduler.dateFactory());
            this.successfulRuns++;
            this.Scheduler.emit(this.id, [response, true, this.lastRunTime, this.nextRunnableTime, this.successfulRuns, this.failedRuns, this.runCount]);
        } catch (e) {
            this.failedRuns++;
            this.Scheduler.emit(this.id, [e, false, this.lastRunTime, this.nextRunnableTime, this.successfulRuns, this.failedRuns, this.runCount]);
        }
        return true;
    }

    setJob(_jobCallable) {
        this.job = _jobCallable;
    }

    //We use this for persistence
    setLastRunTime(_lastRunTime) {
        this.lastRunTime = _lastRunTime;
    }

    setRunHistory(_lastRunTime, _nextRunnableTime) {
        this.lastRunTime = _lastRunTime;
        this.nextRunnableTime = _nextRunnableTime;
    }

    setTimeOfDay(_hours, _minutes) {
        this.timeOfDay = [_hours, _minutes];
        return this;
    }

    setDaysOfWeek(_sun,_mon,_tues,_weds,_thurs,_fri,_sat) {
        this.weeklyDayTargets = [
            undefined,
            !!_sun,
            !!_mon,
            !!_tues,
            !!_weds,
            !!_thurs,
            !!_fri,
            !!_sat
        ];
        return this;
    }

    setWeeksOfMonth(_firstWeek, _secondWeek, _thirdWeek, _fourthWeek, _fifthWeek) {
        this.monthlyWeekTargets = [
            undefined,
            !!_firstWeek,
            !!_secondWeek,
            !!_thirdWeek,
            !!_fourthWeek,
            !!_fifthWeek
        ];
        return this;
    }

    setDaysOfMonth(_daysArray) {
        this.daysOfMonth = _daysArray;
        return this;
    }

    setMonthsOfYear(_monthsArray) {
        this.monthsOfYear = _monthsArray;
        return this;
    }

    setFireOnStart(_fireOnStart) {
        this.fireOnStart = _fireOnStart;
        return this;
    }

    setRepeat(_repeat) {
        this.repeat = !!_repeat;
        return this;
    }

    setRepeatInterval(_hours, _minutes, _seconds) {
        this.setRepeat(true);
        this.repeatInterval = ((_hours || 0)*60*60*1000 + (_minutes || 0)*60*1000 + (_seconds || 0)*1000);
        return this;
    }
}

export default TaskConfig;