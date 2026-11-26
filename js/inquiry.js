/**
 * Sango Plants — Customer Support & B2B Inquiry Ticket System
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'sango-tickets-v1';

  function readTickets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function writeTickets(tickets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  }

  function generateTicketId() {
    return 'TICK-' + Math.floor(10000 + Math.random() * 90000);
  }

  window.InquiryEngine = {
    submitInquiry: function (data) {
      var ticketId = generateTicketId();
      var record = {
        ticketId: ticketId,
        createdAt: new Date().toISOString(),
        dateString: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        type: data.type || 'Support Inquiry',
        name: data.name,
        phone: data.phone,
        email: data.email,
        topic: data.topic || 'General Inquiry',
        message: data.message,
        status: 'Open'
      };

      var tickets = readTickets();
      tickets.unshift(record);
      writeTickets(tickets);

      return record;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var contactForm = document.getElementById('contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!contactForm.checkValidity()) {
          contactForm.reportValidity();
          return;
        }

        var formData = new FormData(contactForm);
        var record = window.InquiryEngine.submitInquiry({
          type: 'Support Inquiry',
          name: formData.get('name'),
          phone: formData.get('phone'),
          email: formData.get('email'),
          topic: formData.get('topic'),
          message: formData.get('message')
        });

        // Submit contact inquiry to Supabase enquiries (via SangoAPI) or backend /api/contact
        var submitBtn = contactForm.querySelector('[type="submit"]');
        var origBtnText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }

        var contactCall = (window.SangoAPI && window.SangoAPI.submitContact)
          ? window.SangoAPI.submitContact({
              ticketId: record.ticketId,
              name: record.name,
              phone: record.phone,
              email: record.email,
              subject: record.topic,
              topic: record.topic,
              message: record.message,
              status: record.status
            })
          : fetch('/api/contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: record.name,
                email: record.email,
                phone: record.phone,
                subject: record.topic,
                message: record.message
              })
            }).then(function (r) { if (!r.ok) throw new Error('Could not send your message'); return r.json(); });

        contactCall.then(function () {
          if (window.showToast) {
            window.showToast('Ticket ' + record.ticketId + ' created! Our plant team will contact you within 24h');
          }
          contactForm.reset();
        }).catch(function (err) {
          console.error('[Inquiry] Submit error:', err);
          if (window.showToast) {
            window.showToast((err && err.message) || 'Could not send your message. Please try again.');
          }
        }).finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origBtnText;
          }
        });
      });
    }
  });

})();
