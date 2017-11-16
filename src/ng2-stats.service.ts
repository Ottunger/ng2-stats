import { EventEmitter, Injectable, NgZone, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/toPromise';

export interface StatsOptions {
  url?: string;
  username?: string;
  token?: string;
  by?: string;
  project?: string;
  reloadOnError?: boolean;
  monitoredHttp?: string;
  checkSubscriptions?: boolean;
}

interface StatsEvent {
  type: 'routingChange' | 'reload' | 'error' | 'http';
  sessionId: string;
  to: string;
  at: number;
  spacing?: number;
  message?: string;
  by?: string;
}

@Injectable()
export class Ng2StatsService implements OnDestroy {
  private static NG2_STATS_LR_KEY = 'ng2-stats.last-reload';
  private static NG2_STATS_LE_KEY = 'ng2-stats.last-error';

  private static DEFAULT_OPTIONS: StatsOptions = {
    url: 'https://ilpnvewoa0.execute-api.eu-west-2.amazonaws.com/prod',
    username: 'spikeseed',
    token: 'qwyzxztsessgaatt',
    by: navigator.userAgent,
    project: encodeURIComponent(document.title.toLowerCase().replace(/\s/g, '')),
    reloadOnError: false,
    monitoredHttp: '.',
    checkSubscriptions: true
  };

  private sessionId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2);
  private routerSub: Subscription;
  private options: StatsOptions = {};
  private loaded = false;
  private lastMove: number;

  private httpGet: (a?: any, b?: any, c?: any) => any;
  private httpPost: (a?: any, b?: any, c?: any) => any;
  private obsSub: (a?: any, b?: any, c?: any) => any;

  private get httpOptions() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + this.options.username + ':' + this.options.token
      }),
      observe: 'response'
    };
  }

  constructor(private router: Router, private http: HttpClient, private zone: NgZone) {
    const self = this;
    let regSubs: Subscription[] = [];

    this.lastMove = new Date().getTime();
    this.httpGet = this.http.get;
    this.httpPost = this.http.post;
    this.obsSub = Observable.prototype.subscribe;

    this.zone.runOutsideAngular(() => {
      const span = document.createElement('SPAN');
      span.innerHTML = '<span style="position: fixed; top: 10px; right: 10px; z-index: 99990; cursor: pointer;">' +
        '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAgCAIAAACKIl8oAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAR0SURBVEhLlZbPa1xVFMfnb3FVcZDgxo0KKWbXhVC6iq2SlULAQEUEIWqdRMEfm7RuAmpLUSrtogsjxWAbppn6AwIaFWok8/PNvGR+hEybl05e0vg593vz+tSXql/I5dxzz/d7zj33vjvJra2tNRqNlkOz2cQOggBbzmq1yjQMw/X1dSIVg0eRmgKMtE0kMSYNs16vM5Eu0yQaJH7AlFX5iRERWzG1Wo1RAcjm5HX5rByVJgIeipUNAeBhJAa/nFBwylZ98hCQS5ZJQAQ0bDzYjFrVVHKASBqlgpgSgwFUsmyQ408ERAHLJJdTI87WysLs6RNHn3gEPD584tXZG38EtmsTcPtQEcpdLpdVpTVEG0lCpY4HG91ycWY0b6JpHDl19vuKtY7+EqkdKAG21HJY8HExUTaiGTVtrF6bfMrL/Q1PvzVfd0QVIUOiMnIUiAJrkpNXU5ZuXxr3ShkYv7xilKRSSoRiLleW9dq66SJ+++z5I4+Nnl2sasq4UPAymTjzrcm5Uio/nDPu+Z/8CUG3G6IkjKtfjj0KI3/yXKnGmRAUxfsPQRxJqPrdzElHHLvi9kE+/L4hasLmvWjlvFen9mSnxKgWpjjxqCCH6q0D3Qu3o8FmUz0hxo6ROIWG4cbdnQP1/wWnu7O1gQhFABLknKJB2ZrNbn8QXX/NU/4jXp+PBne6VAnohoycLqZGpEGj0bk17TlpTP9o/V1610/TmFrscTaIttttSWNYQ5BTQ6TOdhanPCeNwk07n8yshaIdCVJJfcDfEFzQMNAlIpt/M2Rzpayld4r2lSEiIGLSbERzJgAvdia/UDTCYVk7nQ6rcKkMEWANYR7W5t8e9nGHoVC0CjKzpjF85hqfnL8hoNkqvT/i1w4DDaWWf5Ue+aDExqnYpOlg2Ivi++4Lc8i8BjQU6YdcHuF+HHVdY+1Rtca4xgMOE3v5k2OelAI3BGRVfezTZbu73Ai4GIQxmrQuiSC7Mz/pWSkgDTOr6slvul5UlxoRDJMGOlZcNAe7sz434WkPwDGSNUP6lbm1NqQH0D32DcHChY1haC5MPeOJCbhhnPs/pSe+bm+kXmZi0OHH0y4f0ox4MUAYLM2+mPFAca8Jy+h1/rn3btSgqzjlwLCqrUr3Vplw/fev3nzWCCPTS62VC+NDjm2gamipqodevrhU+vi4HuGZ4io6qPMN8vmgZL8yAml5fOfeOGosdO/GUX9rZ29/8+erH54+/mTe32ukh0ZGJz66+mtvf3ewFSWPcP7UTLFMQNJVe/n0I2/jL5+/YEFjl2px1LMSqtVWPxrEu3bn4y1Lv73L1d3bi+/1O7brvzzxL32xfHAj7GtUHvU+7Pdrxeulyvag7x+WSqWiJVrB6HZm3XNl2aFhS92Iq5sbQUCJCrD/+eAojqB+tB31u1iJU4eDzQhHRWGTVZ1lqdXqQdy+08Pjz4xei4yV/FMqFTkBU0bVInUlZgSEOWkDU8UDAnxD8GrOVKLsBmeyJBuDVaXBk6RnCRtgqIFBEPwJ/wGYPtEbbXcAAAAASUVORK5CYII="/></span>';
      span.addEventListener('click', () => {
        this.load(this.options, true);
      });
      document.body.appendChild(span);
    });

    Observable.prototype.subscribe = function(...params: any[]) {
      const sub = self.obsSub.apply(this, params);
      if (self.options.checkSubscriptions) { regSubs.push(sub); }
      return sub;
    };
    this.routerSub = this.router.events.filter((e: any) => e instanceof NavigationEnd).subscribe((e: NavigationEnd) => {
      const now = new Date().getTime();
      this.recordEvent({
        type: 'routingChange',
        sessionId: this.sessionId,
        to: e.urlAfterRedirects,
        at: now,
        spacing: now - this.lastMove,
        by: this.options.by
      });
      this.lastMove = now;

      if (this.options.checkSubscriptions) {
        regSubs = regSubs.filter(sub => !sub.closed && !sub['_parent']
          && sub['_subscriptions'].every((s: any) => s.subject && !s.subject.closed && !(s.subject instanceof EventEmitter)));
        if (regSubs.length) {
          console.warn('NEW REMAINING SUBSCRIPTIONS ON', regSubs.map(sub => [sub, sub['_subscriptions'].map((s: any) => s.subject)]));
        }
        regSubs = [];
      }
    });

    const lastError = localStorage.getItem(Ng2StatsService.NG2_STATS_LE_KEY);
    if (lastError) {
      console.error('PREVIOUSLY RECORDED ERROR', lastError);
      localStorage.removeItem(Ng2StatsService.NG2_STATS_LE_KEY);
    }

    const oldLog = window.console.log;
    let beginCompile = 0;
    (<any>window).console.log = (...params: any[]) => {
      oldLog.apply(null, params);
      if (params[0].toString().indexOf('ecompiling') > -1) { // Webpack recompiling
        beginCompile = new Date().getTime();
      } else if (params[0].toString().indexOf('eloading') > -1) { // Webpack reloading
        const now = new Date().getTime();
        // New session
        this.sessionId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(2);
        localStorage.setItem(Ng2StatsService.NG2_STATS_LR_KEY, JSON.stringify({
          type: 'reload',
          sessionId: this.sessionId,
          to: window.location.toString(),
          at: now,
          spacing: now - beginCompile,
          by: this.options.by
        } as StatsEvent));
      }
    };

    const oldError = window.console.error;
    (<any>window).console.error = (...params: any[]) => {
      oldError.apply(null, params);
      if (params.length > 1 && params[0] === 'ERROR') {
        this.recordEvent({
          type: 'error',
          sessionId: this.sessionId,
          to: window.location.toString(),
          at: new Date().getTime(),
          message: params[1].toString(),
          by: this.options.by
        }).then(() => {
          if (this.options.reloadOnError) {
            const stack = params[1].toString() + ' ON ' + window.location.toString();
            localStorage.setItem(Ng2StatsService.NG2_STATS_LE_KEY, stack);
            window.location.assign(window.location.href);
          }
        });
      }
    };

    (<any>this.http).get = (...params: any[]) => {
      if (new RegExp(this.options.monitoredHttp).test(params[0])) {
        const begin = new Date().getTime();
        return this.httpGet.apply(this.http, params).do(() => {
          const now = new Date().getTime();
          this.recordEvent({
            type: 'http',
            sessionId: this.sessionId,
            to: params[0].replace(/(\?|#).*$/, '').replace(/\/$/, ''),
            at: begin,
            spacing: now - begin,
            by: this.options.by
          });
        });
      }
      return this.httpGet.apply(this.http, params);
    };

    (<any>this.http).post = (...params: any[]) => {
      if (new RegExp(this.options.monitoredHttp).test(params[0])) {
        const begin = new Date().getTime();
        return this.httpPost.apply(this.http, params).do(() => {
          const now = new Date().getTime();
          this.recordEvent({
            type: 'http',
            sessionId: this.sessionId,
            to: params[0].replace(/(\?|#).*$/, '').replace(/\/$/, ''),
            at: begin,
            spacing: now - begin,
            by: this.options.by
          });
        });
      }
      return this.httpPost.apply(this.http, params);
    };
  }

  load(opts: StatsOptions = {}, print = false) {
    this.options = Object.assign({}, Ng2StatsService.DEFAULT_OPTIONS, opts);
    this.options.url = (this.options.url || '').replace(/\/$/, '');

    // Do login
    this.httpGet.call(this.http, this.options.url + '/projects?project=' + this.options.project, this.httpOptions).toPromise()
      .then((res: HttpResponse) => {
        if (!res.ok) {
          this.loaded = false;
          console.error('Cannot log you in on this project...');
        } else {
          this.loaded = true;
          const lastReload = localStorage.getItem(Ng2StatsService.NG2_STATS_LR_KEY);
          if (lastReload) {
            this.recordEvent(JSON.parse(lastReload)).then(ok => {
              if (ok) { localStorage.removeItem(Ng2StatsService.NG2_STATS_LR_KEY); }
            });
          }
          if (print) {
            console.warn(res.body);
          }
        }
      }, () => {
        this.loaded = false;
        console.error('Cannot log you in on this project...');
      });
  }

  ngOnDestroy() {
    this.routerSub.unsubscribe();
  }

  private recordEvent(ev: StatsEvent): Promise<boolean> {
    if (this.loaded) {
      return this.httpPost.call(this.http, this.options.url + '/projects?project=' + this.options.project,
        ev, this.httpOptions).toPromise().then((res: HttpResponse) => res.ok, () => false);
    }
    return Promise.resolve(false);
  }
}
