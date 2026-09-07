import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExperienceCardProps {
  experience: {
    id: number;
    title: string;
    image: string;
    description: string;
  };
  className?: string;
}

export function ExperienceCard({ experience, className }: ExperienceCardProps) {
  return (
    <div
      className={cn(
        'group relative h-80 md:h-96 rounded-2xl overflow-hidden cursor-pointer',
        className
      )}
    >
      <Image
        src={experience.image}
        alt={experience.title}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-110"
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
        <h3 className="font-display text-2xl md:text-3xl font-medium text-white mb-2 group-hover:text-resort-gold-light transition-colors duration-300">
          {experience.title}
        </h3>
        <p className="text-sm text-white/70 leading-relaxed mb-4 max-w-sm">
          {experience.description}
        </p>
        <div className="flex items-center gap-2 text-sm font-semibold text-resort-gold group-hover:gap-3 transition-all duration-300">
          Discover More
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
