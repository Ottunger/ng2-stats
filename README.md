# ng2-stats
A statistics tracker for ng2+

# How to use?
```bash
npm i --save-dev ng2-stats
```

Import the module into your main module, then import Ng2StatsService into your main component,
and load it with your desired options:

```js
this.ng2statsService.load({
    token: 'MYTEAMTOKEN',
    account: 'A username', // Or the user agent
    project: 'A project', // Or the document title
    reloadOnError: false // Whether to reload page when an error is thrown by ng2, its dump being reshown
});
```
