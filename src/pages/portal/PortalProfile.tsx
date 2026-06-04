import React, { useState } from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { User, Phone, Mail, MapPin, Briefcase, Calendar, ShieldCheck, Edit2, Loader2, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ADICORP_LOGO_PATH } from "@/lib/branding";

export default function PortalProfile() {
  const { data, isLoading } = useEmployeePortalData();
  const [editingField, setEditingField] = useState<{ key: string; label: string; value: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const profile = data?.profile;
  if (!profile) return <div>Profile not found</div>;

  const handleEditClick = (key: string, label: string, value: string) => {
    setEditingField({ key, label, value });
    setEditValue(value || "");
  };

  const handleSubmitUpdate = async () => {
    if (!editingField || !editValue) return;
    setIsSubmitting(true);
    try {
      const changes = { [editingField.key]: editValue };
      const { error } = await supabase.rpc("submit_update_request", {
        p_emp_id: profile.id,
        p_changes: changes
      });
      if (error) throw error;
      toast.success("Update request submitted for approval.");
      setEditingField(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Ultra-Premium Centered Header Card */}
      <Card className="border-none shadow-xl shadow-primary/20 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground rounded-[2rem] overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none" />
        
        <CardContent className="p-6 relative z-10 flex flex-col items-center text-center">
          <div className="mb-4">
            <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center text-2xl font-black shadow-lg border-2 border-white/20 overflow-hidden ring-4 ring-black/5 transition-transform hover:scale-105 duration-500">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                profile.name.substring(0, 2).toUpperCase()
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 mb-2 mt-1">
            <h2 className="text-lg font-black text-white drop-shadow-sm tracking-tight">{profile.name}</h2>
            <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
            <p className="text-lg font-black text-white/80 drop-shadow-sm tracking-tight">
              {profile.rank || "Employee"}
            </p>
          </div>
          
          {data.company && (
            <div className="flex items-center gap-1.5 mt-1">
              {data.company.logo_url && (
                <img src={data.company.logo_url} alt="Company" className="w-4 h-4 object-contain drop-shadow-sm opacity-90" />
              )}
              <span className="text-[10px] font-bold text-white/90 tracking-widest uppercase drop-shadow-sm">{data.company.name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Card */}
      <div className="space-y-2.5 mt-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-5">Personal Information</h3>
        <Card className="border-border/30 shadow-xl shadow-primary/5 rounded-3xl overflow-hidden bg-card/60 backdrop-blur-2xl">
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-border/20">
              <DetailRow icon={ShieldCheck} label="CNIC" value={profile.cnic || "Not provided"} locked />
              <DetailRow icon={Phone} label="Phone" value={profile.phone || "Not provided"} editable onEdit={() => handleEditClick('phone', 'Phone', profile.phone)} />
              <DetailRow icon={Mail} label="Email" value={profile.email || "Not provided"} editable onEdit={() => handleEditClick('email', 'Email', profile.email)} />
              <DetailRow icon={Calendar} label="Date of Birth" value={profile.date_of_birth || "Not provided"} editable onEdit={() => handleEditClick('date_of_birth', 'Date of Birth', profile.date_of_birth)} />
              <DetailRow icon={User} label="Father's Name" value={profile.father_name || "Not provided"} editable onEdit={() => handleEditClick('father_name', 'Father\'s Name', profile.father_name)} />
              <DetailRow icon={MapPin} label="Emergency Contact" value={profile.emergency_contact || "Not provided"} editable onEdit={() => handleEditClick('emergency_contact', 'Emergency Contact', profile.emergency_contact)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Work Details */}
      <div className="space-y-2.5 mt-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-5">Work Information</h3>
        <Card className="border-border/30 shadow-xl shadow-primary/5 rounded-3xl overflow-hidden bg-card/60 backdrop-blur-2xl">
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-border/20">
              <DetailRow icon={Briefcase} label="Shift Type" value={profile.shift_type || "Morning"} className="capitalize" locked />
              <DetailRow icon={Calendar} label="Joining Date" value={profile.joining_date || "Not provided"} editable onEdit={() => handleEditClick('joining_date', 'Joining Date', profile.joining_date)} />
              <DetailRow icon={Briefcase} label="Salary Divisor" value={`${profile.salary_divisor} days`} locked />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Events */}
      <div className="space-y-2.5 pb-8 mt-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 pl-5">Upcoming Events</h3>
        <div className="space-y-3">
          {data.events && data.events.length > 0 ? (
            data.events
              .filter((e: any) => new Date(e.date) >= new Date(new Date().setHours(0,0,0,0)))
              .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .slice(0, 3)
              .map((event: any) => (
                <Card key={event.id} className="border-none shadow-md rounded-2xl bg-gradient-to-r from-yellow-500/10 to-transparent border-l-4 border-l-yellow-500 relative overflow-hidden">
                  <div className="p-4 flex gap-4 items-center">
                    <div className="w-12 h-12 shrink-0 rounded-xl bg-yellow-500 text-white flex flex-col items-center justify-center font-black shadow-inner leading-none">
                      <span className="text-xs font-semibold opacity-90 uppercase tracking-widest">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-xl tracking-tighter">{new Date(event.date).getDate()}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">{event.title}</h4>
                      {event.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{event.description}</p>}
                      <Badge variant="outline" className="mt-2 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 border-yellow-500/30 text-[9px] uppercase tracking-wider py-0 px-1.5 h-4">Company Event</Badge>
                    </div>
                  </div>
                </Card>
            ))
          ) : (
            <Card className="border-border/30 border-dashed shadow-none rounded-3xl bg-muted/20">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">No Upcoming Events</p>
                <p className="text-xs text-muted-foreground/70 mt-1">There are no company events scheduled.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Request Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="sm:max-w-md w-[90%] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Update {editingField?.label}</DialogTitle>
            <DialogDescription>
              Submit a request to HR to update your {editingField?.label?.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground ml-1">New Value</label>
              <Input
                type={editingField?.key.includes('date') ? 'date' : 'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-12 bg-muted/50 rounded-xl border-transparent focus:border-primary"
              />
            </div>
            <Button 
              onClick={handleSubmitUpdate} 
              disabled={isSubmitting || editValue === editingField?.value || !editValue}
              className="w-full h-11 rounded-xl shadow-md font-bold"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, editable, locked, onEdit, className = "" }: { icon: any, label: string, value: string, editable?: boolean, locked?: boolean, onEdit?: () => void, className?: string }) {
  const handleLockedClick = () => {
    toast.info("This info is sensitive and cannot be changed here. Please contact HR.");
  };

  return (
    <div className="flex items-center justify-between p-3.5 px-4 bg-transparent hover:bg-muted/40 transition-colors active:bg-muted/60 gap-3">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-primary/5 flex items-center justify-center shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] border border-primary/5">
          <Icon className="w-4 h-4 text-primary/80" strokeWidth={2.5} />
        </div>
        <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
        <span className={`text-xs font-semibold text-foreground text-right tracking-wide truncate ${className}`}>{value}</span>
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          {editable && (
            <button onClick={onEdit} className="p-1.5 bg-primary/5 hover:bg-primary/15 rounded-lg text-primary transition-all active:scale-90" title="Request Edit">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {locked && (
            <button onClick={handleLockedClick} className="p-1.5 text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors active:scale-90" title="Fixed Field">
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
