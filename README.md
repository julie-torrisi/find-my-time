# find-my-time

A Chrome extension that shows your own free/busy on booking pages (Calendly, GoodTime, and more), ranks the open slots, and tells you why each one fits.

**Fully local:** there's no server and no analytics, and your calendar data never leaves your browser. It suggests times only and never books for you.

> Status: early scaffold. Nothing works yet.

## Develop

```bash
npm install
npm run build      # outputs dist/
npm test
npm run lint
```

Load it in Chrome: go to `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick `dist/`.

## License

MIT
