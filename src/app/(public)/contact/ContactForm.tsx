'use client';

import { useState } from 'react';
import { Send, Check } from 'lucide-react';

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-resort-forest/10 flex items-center justify-center mx-auto mb-5">
          <Check className="h-8 w-8 text-resort-forest" />
        </div>
        <h4 className="font-display text-xl font-medium text-resort-charcoal-text mb-2">
          Message Sent
        </h4>
        <p className="text-sm text-resort-muted max-w-sm mx-auto">
          Thank you for reaching out to Infinity Resort. Our team will respond within 24 hours.
        </p>
        <button
          onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', phone: '', subject: '', message: '' }); }}
          className="mt-6 text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2">
            Email *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="you@email.com"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2">
            Phone
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2">
            Subject *
          </label>
          <select
            required
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors appearance-none"
          >
            <option value="">Select a subject</option>
            <option value="reservation">Reservation Inquiry</option>
            <option value="event">Event & Wedding</option>
            <option value="spa">Spa & Wellness</option>
            <option value="dining">Dining Reservation</option>
            <option value="concierge">Concierge Request</option>
            <option value="feedback">Feedback</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2">
          Message *
        </label>
        <textarea
          required
          rows={5}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors resize-none"
          placeholder="Tell us how we can assist you..."
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-all duration-300 text-sm"
      >
        <Send className="h-4 w-4" />
        Send Message
      </button>
    </form>
  );
}
