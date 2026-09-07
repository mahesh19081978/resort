'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { IMAGES } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { GalleryLightbox } from '@/components/public/GalleryLightbox';
import { cn } from '@/lib/utils';

const CATEGORIES = ['All', 'Resort', 'Rooms', 'Dining', 'Nature', 'Amenities'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_MAP: Record<Category, string> = {
  All: 'all',
  Resort: 'resort',
  Rooms: 'rooms',
  Dining: 'dining',
  Nature: 'nature',
  Amenities: 'amenities',
};

export default function GalleryPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    document.title = 'Gallery — Infinity Resort';
  }, []);

  const filteredImages =
    activeCategory === 'All'
      ? [...IMAGES.gallery]
      : IMAGES.gallery.filter((img) => img.category === CATEGORY_MAP[activeCategory]);

  const handleImageClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <Image
          src={IMAGES.gallery[0].src}
          alt="Infinity Resort gallery"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <SectionHeading
              label="Visual Gallery"
              title="Gallery"
              description="A Visual Journey"
              light
            />
          </ScrollReveal>
        </div>
      </section>

      {/* ─── FILTER + GALLERY ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <div className="flex flex-wrap justify-center gap-3 mb-14">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300',
                    activeCategory === cat
                      ? 'bg-resort-forest text-white shadow-luxury'
                      : 'bg-resort-sand/60 text-resort-charcoal-text hover:bg-resort-sand hover:shadow-luxury'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </ScrollReveal>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[220px] md:auto-rows-[260px]"
            >
              {filteredImages.map((image, index) => {
                const isLarge = index % 7 === 0;
                const isTall = index % 5 === 1;

                return (
                  <motion.button
                    key={image.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3, delay: index * 0.04 }}
                    onClick={() => handleImageClick(index)}
                    className={cn(
                      'group relative rounded-2xl overflow-hidden cursor-pointer shadow-luxury hover:shadow-luxury-lg transition-shadow duration-500',
                      isLarge && 'col-span-2 row-span-2',
                      isTall && !isLarge && 'row-span-2'
                    )}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-resort-gold/90 text-[10px] font-semibold uppercase tracking-wider text-resort-charcoal-text mb-2">
                        {image.category}
                      </span>
                      <p className="text-sm text-white font-medium leading-snug">
                        {image.alt}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {filteredImages.length === 0 && (
            <div className="text-center py-20">
              <p className="text-resort-muted text-lg">No images found in this category.</p>
            </div>
          )}
        </div>
      </section>

      <GalleryLightbox
        images={filteredImages}
        startIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
