(function() {
  var script = document.currentScript
  var apiKey = script && script.getAttribute('data-key')
  if (!apiKey) return console.error('Handymate: data-key saknas')

  var API_URL = 'https://app.handymate.se/api/leads/intake'

  var inputStyle = 'display:block;width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;font-family:inherit;'

  var formHTML = '<div id="hm-widget" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">'
    + '<h3 style="margin:0 0 16px;color:#111;font-size:18px">Kontakta oss</h3>'
    + '<form id="hm-form">'
    + '<input id="hm-name" placeholder="Ditt namn *" required style="' + inputStyle + '">'
    + '<input id="hm-phone" placeholder="Telefonnummer *" type="tel" required style="' + inputStyle + '">'
    + '<input id="hm-email" placeholder="E-post (valfritt)" type="email" style="' + inputStyle + '">'
    + '<textarea id="hm-message" placeholder="Beskriv ditt \u00e4rende..." rows="3" style="' + inputStyle + 'resize:vertical;"></textarea>'
    + '<button type="submit" id="hm-submit" style="width:100%;padding:12px;background:#0F766E;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer;margin-top:8px;font-weight:500;font-family:inherit;">Skicka \u2192</button>'
    + '<p id="hm-status" style="text-align:center;margin-top:12px;font-size:14px"></p>'
    + '</form>'
    + '</div>'

  var target = document.getElementById('handymate-form')

  if (target) {
    target.innerHTML = formHTML
  } else {
    var bubble = document.createElement('div')
    bubble.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;'
    bubble.innerHTML = '<button id="hm-bubble-btn" style="background:#0F766E;color:white;border:none;border-radius:50px;padding:14px 20px;font-size:14px;cursor:pointer;font-weight:500;box-shadow:0 4px 16px rgba(15,118,110,0.4);font-family:-apple-system,sans-serif;">\uD83D\uDCCB Be om offert</button>'
      + '<div id="hm-bubble-form" style="display:none;position:absolute;bottom:60px;right:0;width:320px;">' + formHTML + '</div>'
    document.body.appendChild(bubble)

    document.getElementById('hm-bubble-btn').onclick = function() {
      var form = document.getElementById('hm-bubble-form')
      form.style.display = form.style.display === 'none' ? 'block' : 'none'
    }
  }

  document.getElementById('hm-form').addEventListener('submit', function(e) {
    e.preventDefault()
    var btn = document.getElementById('hm-submit')
    var status = document.getElementById('hm-status')

    btn.textContent = 'Skickar...'
    btn.disabled = true
    status.textContent = ''

    var payload = {
      name: document.getElementById('hm-name').value,
      phone: document.getElementById('hm-phone').value,
      email: document.getElementById('hm-email').value || '',
      message: document.getElementById('hm-message').value || ''
    }

    var xhr = new XMLHttpRequest()
    xhr.open('POST', API_URL + '?api_key=' + encodeURIComponent(apiKey))
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        document.getElementById('hm-form').innerHTML = '<div style="text-align:center;padding:24px 0">'
          + '<div style="font-size:40px">\u2705</div>'
          + '<p style="font-size:16px;color:#111;margin:12px 0 4px;font-weight:500">Tack f\u00f6r ditt meddelande!</p>'
          + '<p style="color:#64748b;font-size:14px">Vi \u00e5terkommer inom kort.</p>'
          + '</div>'
      } else {
        status.textContent = '\u274C N\u00e5got gick fel. Ring oss ist\u00e4llet.'
        status.style.color = '#dc2626'
        btn.textContent = 'Skicka \u2192'
        btn.disabled = false
      }
    }
    xhr.onerror = function() {
      status.textContent = '\u274C N\u00e5got gick fel. Ring oss ist\u00e4llet.'
      status.style.color = '#dc2626'
      btn.textContent = 'Skicka \u2192'
      btn.disabled = false
    }
    xhr.send(JSON.stringify(payload))
  })
})()
