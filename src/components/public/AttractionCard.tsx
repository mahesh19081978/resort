import Image from 'next/image';
import { MapPin, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttractionCardProps {
  attraction: {
    id: number;
    name: string;
    image: string;
    distance: string;
    description: string;
  };
  className?: string;
}

export function AttractionCard({ attraction, className }: AttractionCardProps) {
  return (
    <div
      className={cn(
        'group grid grid-cols-1 md:grid-cols-5 gap-0 rounded-2xl overflow-hidden bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-500',
        className
      )}
    >
      <div className="relative h-64 md:h-full md:col-span-2 overflow-hidden">
        <Image
          src={attraction.image}
          alt={attraction.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 40vw"
        />
      </div>
      <div className="flex flex-col justify-center p-6 md:p-8 md:col-span-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-resort-gold mb-3">
          <MapPin className="h-3.5 w-3.5" />
          <span>{attraction.distance} from resort</span>
        </div>
        <h3 className="font-display text-xl md:text-2xl font-medium text-resort-charcoal-text mb-3">
          {attraction.name}
        </h3>
        <p className="text-sm text-resort-muted leading-relaxed mb-5">
          {attraction.description}
        </p>
        <div className="flex items-center gap-2 text-sm font-semibold text-resort-gold-dark group-hover:text-resort-forest transition-colors cursor-pointer">
          Learn More
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
}
