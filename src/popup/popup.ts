const statusEl = document.getElementById('status');
chrome.runtime.sendMessage({ type: 'ping' }).then((res) => {
  if (statusEl && res?.type === 'pong') statusEl.textContent = 'Background is running.';
});
export {};
