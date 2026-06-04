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
      <Card className="border-none shadow-2xl shadow-primary/20 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground rounded-[2.5rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-black/10 rounded-full blur-2xl pointer-events-none -ml-10 -mb-10" />
        
        <CardContent className="p-8 relative z-10 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="w-24 h-24 rounded-[2rem] bg-white/20 backdrop-blur-md text-white flex items-center justify-center text-3xl font-black shadow-xl border-4 border-white/20 overflow-hidden ring-4 ring-black/5 transition-transform hover:scale-105 duration-500">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                profile.name.substring(0, 2).toUpperCase()
              )}
            </div>
            {profile.status === 'active' && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-400 border-4 border-primary rounded-full shadow-lg" title="Active Employee" />
            )}
          </div>
          
          <h2 className="text-[26px] leading-none font-black text-white drop-shadow-md tracking-tight mb-2">{profile.name}</h2>
          <p className="text-sm text-primary-foreground/90 flex items-center justify-center gap-1.5 font-semibold mb-6 tracking-wide">
            <Briefcase className="w-4 h-4 opacity-80" /> {profile.rank || "Employee"}
          </p>
          
          {data.company && (
            <div className="flex items-center gap-2.5 px-5 py-2.5 bg-black/15 backdrop-blur-md rounded-2xl border border-white/10 shadow-inner">
              {data.company.logo_url ? (
                <div className="w-7 h-7 bg-white rounded-xl p-1 shadow-sm flex items-center justify-center shrink-0">
                  <img src={data.company.logo_url} alt="Company" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-7 h-7 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <Briefcase className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <span className="text-[11px] font-black text-white tracking-[0.15em] uppercase drop-shadow-sm">{data.company.name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Card */}
      <div className="space-y-3 mt-8">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pl-6">Personal Information</h3>
        <Card className="border-border/30 shadow-xl shadow-primary/5 rounded-[2rem] overflow-hidden bg-card/60 backdrop-blur-2xl">
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
      <div className="space-y-3 pb-8 mt-6">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pl-6">Work Information</h3>
        <Card className="border-border/30 shadow-xl shadow-primary/5 rounded-[2rem] overflow-hidden bg-card/60 backdrop-blur-2xl">
          <CardContent className="p-0">
            <div className="flex flex-col divide-y divide-border/20">
              <DetailRow icon={Briefcase} label="Shift Type" value={profile.shift_type || "Morning"} className="capitalize" locked />
              <DetailRow icon={Calendar} label="Joining Date" value={profile.joining_date || "Not provided"} editable onEdit={() => handleEditClick('joining_date', 'Joining Date', profile.joining_date)} />
              <DetailRow icon={Briefcase} label="Salary Divisor" value={`${profile.salary_divisor} days`} locked />
            </div>
          </CardContent>
        </Card>
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
    <div className="flex items-center justify-between p-4 px-5 bg-transparent hover:bg-muted/40 transition-colors active:bg-muted/60">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] border border-primary/5">
          <Icon className="w-[18px] h-[18px] text-primary" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-extrabold text-muted-foreground/80 uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[13px] font-bold text-foreground text-right tracking-wide ${className}`}>{value}</span>
        <div className="w-8 h-8 flex items-center justify-center shrink-0">
          {editable && (
            <button onClick={onEdit} className="p-2 bg-primary/10 hover:bg-primary/20 rounded-xl text-primary transition-all active:scale-90" title="Request Edit">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {locked && (
            <button onClick={handleLockedClick} className="p-2 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors active:scale-90" title="Fixed Field">
              <Lock className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
