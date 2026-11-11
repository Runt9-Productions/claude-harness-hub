# claude-harness-hub

A local web app that shows every running Claude Code session on this machine (its status, its board and its away
mode) and lets you answer a session's pending decisions from the browser. Answers reach a session over a local Unix
socket through the optional `hub` plugin, which passes them on to the `board` and `away` plugins. The hub binds
`127.0.0.1` only.

## Starting the hub

From the repository root, in a terminal:

```
nvm use
npm ci
npm start
```

Open the link it prints. It refuses to start when its output is not a terminal, since the link is printed only there,
and when its port (47821 by default) is busy; `npm start -- --port <port>` picks another.

To update, pull and run `npm ci` again before `npm start`.
