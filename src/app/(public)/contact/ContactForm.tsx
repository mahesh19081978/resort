'use client';

import { useState } from 'react';
import { Send, Check, Loader2 } from 'lucide-react';

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    enquiryType: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Client-side only — no backend submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 800);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (submitted) {
    return (
      <div className="text-center py-12" role="status" aria-live="polite">
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
          onClick={() => {
            setSubmitted(false);
            setFormData({ name: '', email: '', phone: '', enquiryType: '', message: '' });
          }}
          className="mt-6 text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor="contact-name"
            className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2"
          >
            Full Name <span className="text-resort-gold" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="Your full name"
          />
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2"
          >
            Email <span className="text-resort-gold" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="you@email.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor="contact-phone"
            className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2"
          >
            Phone
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            placeholder="+91 98765 43210"
          />
        </div>
        <div>
          <label
            htmlFor="contact-enquiry-type"
            className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2"
          >
            Enquiry Type <span className="text-resort-gold" aria-hidden="true">*</span>
          </label>
          <select
            id="contact-enquiry-type"
            name="enquiryType"
            required
            value={formData.enquiryType}
            onChange={handleChange}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors appearance-none"
          >
            <option value="">Select enquiry type</option>
            <option value="general">General Enquiry</option>
            <option value="reservation">Room Reservation</option>
            <option value="restaurant">Restaurant</option>
            <option value="events">Events &amp; Celebrations</option>
            <option value="corporate">Corporate / Group Booking</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="text-xs font-semibold uppercase tracking-wider text-resort-muted block mb-2"
        >
          Message <span className="text-resort-gold" aria-hidden="true">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          value={formData.message}
          onChange={handleChange}
          className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors resize-none"
          placeholder="Tell us how we can help..."
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-all duration-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send Enquiry
          </>
        )}
      </button>
    </form>
  );
}
