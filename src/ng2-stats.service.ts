import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Http, Headers, Response } from '@angular/http';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/toPromise';

export interface StatsOptions {
  url?: string;
  token?: string;
  account?: string;
  project?: string;
  reloadOnError?: boolean;
  monitoredHttp?: string;
}

interface StatsEvent {
  type: 'routingChange' | 'reload' | 'error' | 'http';
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
  private httpGet: Function;
  private httpPost: Function;

  private options: StatsOptions = {
    url: 'https://ilpnvewoa0.execute-api.eu-west-2.amazonaws.com/prod',
    token: 'SPIKESEED',
    account: navigator.userAgent,
    project: encodeURIComponent(document.title.toLowerCase().replace(/\s/g, '')),
    reloadOnError: false,
    monitoredHttp: '.'
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
    this.httpGet = this.http.get;
    this.httpPost = this.http.post;

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

    (<any>this.http).get = (...params: any[]) => {
      if (new RegExp(this.options.monitoredHttp).test(params[0])) {
        const begin = new Date().getTime();
        return this.httpGet.apply(this.http, params).map((res: Response) => {
          const now = new Date().getTime();
          this.recordEvent({
            type: 'http',
            to: params[0],
            at: begin,
            spacing: now - begin,
            by: this.options.account
          });
          return res;
        });
      }
      return this.httpGet.apply(this.http, params);
    };

    (<any>this.http).post = (...params: any[]) => {
      if (new RegExp(this.options.monitoredHttp).test(params[0])) {
        const begin = new Date().getTime();
        return this.httpPost.apply(this.http, params).map((res: Response) => {
          const now = new Date().getTime();
          this.recordEvent({
            type: 'http',
            to: params[0],
            at: begin,
            spacing: now - begin,
            by: this.options.account
          });
          return res;
        });
      }
      return this.httpPost.apply(this.http, params);
    };
  }

  load(opts: StatsOptions = {}) {
    this.options = Object.assign(this.options, opts);
    this.options.url = (this.options.url || '').replace(/\/$/, '');
    this.httpGet.call(this.http, this.options.url + '/projects?project=' + this.options.project, this.httpOptions).toPromise().then((res: Response) => {
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
      return this.httpPost.call(this.http, this.options.url + '/projects?project=' + this.options.project,
        ev, this.httpOptions).toPromise().then((res: Response) => res.ok, () => false);
    }
    return Promise.resolve(false);
  }
}
