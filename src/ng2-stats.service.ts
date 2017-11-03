import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Http, Headers } from '@angular/http';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/toPromise';

export interface StatsOptions {
  url?: string;
  token?: string;
  account?: string;
  project?: string;
  reloadOnError?: boolean;
}

interface StatsEvent {
  type: 'routingChange' | 'reload' | 'error';
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

  private routerSub: Subscription;
  private loaded = false;
  private lastMove: number;

  private options: StatsOptions = {
    url: 'https://ng2-stats.mateitright.be',
    token: 'SOMETOKEN',
    account: navigator.userAgent,
    project: document.title.toLowerCase(),
    reloadOnError: false
  };

  private get httpOptions() {
    return {headers: new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + this.options.token
    })};
  }

  constructor(private router: Router, private http: Http) {
    this.lastMove = new Date().getTime();
    this.routerSub = this.router.events.filter(e => e instanceof NavigationEnd).subscribe((e: NavigationEnd) => {
      const now = new Date().getTime();
      this.recordEvent({
        type: 'routingChange',
        to: e.urlAfterRedirects,
        at: now,
        spacing: now - this.lastMove,
        by: this.options.account
      });
      this.lastMove = now;
    });

    const lastError = localStorage.getItem(Ng2StatsService.NG2_STATS_LE_KEY);
    if (lastError) {
      console.error('PREVIOUSLY RECORDED ERROR', lastError);
      localStorage.removeItem(Ng2StatsService.NG2_STATS_LE_KEY);
    }

    const oldLog = window.console.log;
    (<any>window).console.log = (...params: any[]) => {
      oldLog.apply(null, params);
      if (params[0].toString().indexOf('ecompiling') > -1) { // Webpack recompiling
        const now = new Date().getTime();
        localStorage.setItem(Ng2StatsService.NG2_STATS_LR_KEY, JSON.stringify({
          type: 'reload',
          to: window.location.toString(),
          at: now,
          spacing: now - this.lastMove,
          by: this.options.account
        } as StatsEvent));
      }
    };

    const oldError = window.console.error;
    (<any>window).console.error = (...params: any[]) => {
      oldError.apply(null, params);
      if (params.length > 1 && params[0] === 'ERROR') {
        this.recordEvent({
          type: 'error',
          to: window.location.toString(),
          at: new Date().getTime(),
          message: params[1].toString(),
          by: this.options.account
        }).then(() => {
          if (this.options.reloadOnError) {
            const stack = params[1].toString() + ' ON ' + window.location.toString();
            localStorage.setItem(Ng2StatsService.NG2_STATS_LE_KEY, stack);
            window.location.assign(window.location.href);
          }
        });
      }
    };
  }

  load(opts: StatsOptions = {}) {
    this.options = Object.assign(this.options, opts);
    this.options.url = (this.options.url || '').replace(/\/?(api)?\/?$/, '');
    this.http.get(this.options.url + '/api/project/' + this.options.project, this.httpOptions).toPromise().then(res => {
      if (!res.ok) {
        this.loaded = false;
        console.error('Cannot log you in on this project...');
      } else {
        this.loaded = true;
        const lastReload = localStorage.getItem(Ng2StatsService.NG2_STATS_LR_KEY);
        if (lastReload) {
          this.recordEvent(JSON.parse(lastReload)).then(() => localStorage.removeItem(Ng2StatsService.NG2_STATS_LR_KEY));
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

  private recordEvent(ev: StatsEvent): Promise<undefined> {
    if (this.loaded) {
      return this.http.post(this.options.url + '/api/project/' + this.options.project + '/record',
        ev, this.httpOptions).toPromise().catch(() => {});
    }
    return Promise.resolve();
  }
}
