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

        // Auto-sync contact details to Supabase contact_inquiries table
        if (window.SangoSupabase) {
          window.SangoSupabase.from('contact_inquiries').insert([{
            ticket_id: record.ticketId,
            name: record.name,
            phone: record.phone,
            email: record.email,
            topic: record.topic,
            message: record.message,
            status: record.status
          }]).then(function () {}).catch(function (sbErr) {
            console.warn('[Inquiry] Supabase inquiry notice:', sbErr);
          });
        }

        // Auto-sync contact details to the Contact Inquiries Spreadsheet
        try {
          fetch('http://localhost:8080/api/spreadsheet/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: record.ticketId,
              name: record.name,
              phone: record.phone,
              email: record.email,
              topic: record.topic,
              message: record.message,
              status: record.status
            })
          }).catch(function (err) {
            console.warn('[Inquiry] Could not sync to spreadsheet endpoint:', err.message);
          });
        } catch (e) {
          console.warn('[Inquiry] Spreadsheet sync exception:', e);
        }

        if (window.showToast) {
          window.showToast('Ticket ' + record.ticketId + ' created! Our plant team will contact you within 24h 🌿');
        }

        contactForm.reset();
      });
    }
  });

})();
