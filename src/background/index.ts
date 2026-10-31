// Service worker: auth, calendar fetch, busy cache, messaging. Filled in from build step 4 on.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[find-my-time] installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ping') {
    sendResponse({ type: 'pong' });
  }
  return false;
});
