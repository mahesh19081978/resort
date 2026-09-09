'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InHouseRoomCard, InHouseFilter } from '@/lib/frontdesk/inhouse';
import { PostChargeModal } from '@/components/frontdesk/PostChargeModal';
import {
  BedDouble,
  Users,
  Phone,
  Clock,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Plus,
} from 'lucide-react';

interface InHouseCardGridProps {
  rooms: InHouseRoomCard[];
  searchQuery: string;
  filter: InHouseFilter;
}

export function InHouseCardGrid({ rooms, searchQuery, filter }: InHouseCardGridProps) {
  const router = useRouter();
  const [chargeRoom, setChargeRoom] = useState<InHouseRoomCard | null>(null);

  if (rooms.length === 0) {
    return (
      <div className="text-center py-12 text-resort-muted">
        <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-serif text-lg">No rooms found</p>
        <p className="text-sm mt-1">
          {searchQuery
            ? `No results for "${searchQuery}"`
            : 'No rooms match the current filter'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Card
            key={room.stayId}
            className={`relative overflow-hidden transition-shadow hover:shadow-md ${
              room.isOverdue
                ? 'border-red-300 bg-red-50/30'
                : room.isCheckoutToday
                ? 'border-amber-300 bg-amber-50/30'
                : ''
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">{room.roomNumber}</span>
                    {room.isOverdue && (
                      <Badge variant="danger" className="text-[10px]">
                        <AlertTriangle className="w-3 h-3 mr-0.5" /> Overdue
                      </Badge>
                    )}
                    {room.isCheckoutToday && !room.isOverdue && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">
                        <Clock className="w-3 h-3 mr-0.5" /> Checkout Today
                      </Badge>
                    )}
                    {room.isPaid && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">
                        <CheckCircle2 className="w-3 h-3 mr-0.5" /> Paid
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-resort-muted mt-1">
                    {room.roomTypeName}
                    {room.buildingName && ` · ${room.buildingName}`}
                    {room.floorName && ` · ${room.floorName}`}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <p className="font-medium text-sm text-resort-charcoal">{room.guestName}</p>
                {room.guestPhone && (
                  <p className="text-xs text-resort-muted flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {room.guestPhone}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-resort-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {room.guestCount} guest{room.guestCount > 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <BedDouble className="w-3 h-3" /> {room.nightsElapsed} night{room.nightsElapsed > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-resort-muted mt-1">
                  <span>In: {new Date(room.actualCheckIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span>Out: {new Date(room.expectedCheckOut).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </div>
              </div>

              <div className="border-t border-resort-sand pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-resort-muted">Stay #{room.stayNumber}</span>
                  {room.reservationNumber && (
                    <span className="text-resort-muted">Res #{room.reservationNumber}</span>
                  )}
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-resort-muted">Room Charges</span>
                    <span className="font-mono">{room.roomCharges}</span>
                  </div>
                  {parseFloat(room.additionalCharges) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-resort-muted">Additional</span>
                      <span className="font-mono">{room.additionalCharges}</span>
                    </div>
                  )}
                  {parseFloat(room.restaurantCharges) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-resort-muted">Restaurant</span>
                      <span className="font-mono">{room.restaurantCharges}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-resort-muted">Tax</span>
                    <span className="font-mono">{room.taxCharges}</span>
                  </div>
                  {parseFloat(room.discountCredits) > 0 && (
                    <div className="flex justify-between text-xs text-green-600">
                      <span>Discount/Credit</span>
                      <span className="font-mono">-{room.discountCredits}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-medium border-t border-resort-sand pt-1 mt-1">
                    <span>Total</span>
                    <span className="font-mono">{room.totalFolioCharges}</span>
                  </div>
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Payments</span>
                    <span className="font-mono">{room.paymentsReceived}</span>
                  </div>
                  <div className={`flex justify-between text-xs font-bold ${
                    parseFloat(room.outstandingBalance) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    <span>Balance</span>
                    <span className="font-mono">{room.outstandingBalance}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-[10px]"
                  onClick={() => router.push(`/admin/frontdesk/inhouse/${room.stayId}/bill`)}
                >
                  View Bill
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-[10px]"
                  onClick={() => setChargeRoom(room)}
                >
                  <Plus className="w-3 h-3 mr-0.5" /> Post Charges
                </Button>
                <Button
                  size="sm"
                  variant={parseFloat(room.outstandingBalance) > 0 ? 'primary' : 'outline'}
                  className={`text-[10px] ${parseFloat(room.outstandingBalance) > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
                  onClick={() => router.push(`/admin/frontdesk/checkout/${room.stayId}`)}
                >
                  <LogOut className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {chargeRoom && (
        <PostChargeModal
          stayId={chargeRoom.stayId}
          stayNumber={chargeRoom.stayNumber}
          roomNumber={chargeRoom.roomNumber}
          guestName={chargeRoom.guestName}
          onClose={() => setChargeRoom(null)}
        />
      )}
    </>
  );
}
