(function() {
  'use strict';

  // Find the script tag to get config
  var scripts = document.querySelectorAll('script[data-business-id]');
  var script = scripts[scripts.length - 1];
  if (!script) return;

  var businessId = script.getAttribute('data-business-id');
  if (!businessId) return;

  var appUrl = script.src.replace('/widget/loader.js', '');

  // Create widget container
  var container = document.createElement('div');
  container.id = 'handymate-widget-container';
  container.style.cssText = 'position:fixed;bottom:0;right:0;z-index:999999;';
  document.body.appendChild(container);

  // Fetch config
  fetch(appUrl + '/api/widget/config?bid=' + encodeURIComponent(businessId))
    .then(function(r) { return r.json(); })
    .then(function(config) {
      if (config.error) return;
      initWidget(config);
    })
    .catch(function() {});

  function initWidget(config) {
    var isOpen = false;
    var position = config.position || 'right';

    // Update container position
    container.style.cssText = 'position:fixed;bottom:0;' + position + ':0;z-index:999999;';

    // Create toggle button
    var btn = document.createElement('div');
    btn.id = 'handymate-widget-btn';
    btn.style.cssText = [
      'position:fixed',
      'bottom:20px',
      position + ':20px',
      'width:60px',
      'height:60px',
      'border-radius:50%',
      'background:' + (config.color || '#0891b2'),
      'cursor:pointer',
      'box-shadow:0 4px 20px rgba(0,0,0,0.15)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:999999',
      'transition:transform 0.2s ease'
    ].join(';');
    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    btn.onmouseenter = function() { btn.style.transform = 'scale(1.1)'; };
    btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; };
    btn.onclick = function() { toggleWidget(); };
    container.appendChild(btn);

    // Create iframe container
    var iframeWrap = document.createElement('div');
    iframeWrap.id = 'handymate-widget-frame-wrap';
    iframeWrap.style.cssText = [
      'position:fixed',
      'bottom:90px',
      position + ':20px',
      'width:380px',
      'height:560px',
      'max-height:calc(100vh - 120px)',
      'border-radius:16px',
      'overflow:hidden',
      'box-shadow:0 8px 40px rgba(0,0,0,0.15)',
      'display:none',
      'z-index:999999',
      'opacity:0',
      'transform:translateY(20px)',
      'transition:opacity 0.3s ease, transform 0.3s ease'
    ].join(';');
    container.appendChild(iframeWrap);

    // Create iframe
    var iframe = document.createElement('iframe');
    iframe.src = appUrl + '/widget/chat?bid=' + encodeURIComponent(businessId);
    iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:16px;';
    iframe.setAttribute('title', config.bot_name || 'Chat');
    iframe.setAttribute('allow', 'clipboard-write');
    iframeWrap.appendChild(iframe);

    // Mobile responsive
    function updateMobileStyles() {
      if (window.innerWidth <= 480) {
        iframeWrap.style.width = '100vw';
        iframeWrap.style.height = 'calc(100vh - 70px)';
        iframeWrap.style.bottom = '0';
        iframeWrap.style[position] = '0';
        iframeWrap.style.borderRadius = '0';
        iframeWrap.style.maxHeight = '100vh';
      } else {
        iframeWrap.style.width = '380px';
        iframeWrap.style.height = '560px';
        iframeWrap.style.bottom = '90px';
        iframeWrap.style[position] = '20px';
        iframeWrap.style.borderRadius = '16px';
        iframeWrap.style.maxHeight = 'calc(100vh - 120px)';
      }
    }
    window.addEventListener('resize', updateMobileStyles);

    function toggleWidget() {
      isOpen = !isOpen;
      if (isOpen) {
        updateMobileStyles();
        iframeWrap.style.display = 'block';
        // Trigger animation
        setTimeout(function() {
          iframeWrap.style.opacity = '1';
          iframeWrap.style.transform = 'translateY(0)';
        }, 10);
        // Change button to X
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      } else {
        iframeWrap.style.opacity = '0';
        iframeWrap.style.transform = 'translateY(20px)';
        setTimeout(function() { iframeWrap.style.display = 'none'; }, 300);
        // Change button back to chat
        btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
      }
    }

    // Listen for close message from iframe
    window.addEventListener('message', function(e) {
      if (e.data === 'handymate-widget-close') {
        if (isOpen) toggleWidget();
      }
    });
  }
})();
