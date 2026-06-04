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
      {/* Header Card */}
      <Card className="border-none shadow-sm bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-black shadow-lg shadow-primary/30 shrink-0">
              {profile.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{profile.name}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                <Briefcase className="w-3.5 h-3.5 shrink-0" /> {profile.rank || "Employee"}
              </p>
              
              {data.company && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary/10">
                  {data.company.logo_url ? (
                    <img src={data.company.logo_url} alt="Company" className="w-5 h-5 object-contain rounded-sm" />
                  ) : (
                    <div className="w-5 h-5 bg-primary/20 rounded-sm flex items-center justify-center shrink-0">
                      <Briefcase className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="text-xs font-semibold text-primary truncate">{data.company.name}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Card */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border/30">
            <DetailRow icon={ShieldCheck} label="CNIC" value={profile.cnic || "Not provided"} locked />
            <DetailRow icon={Phone} label="Phone" value={profile.phone || "Not provided"} editable onEdit={() => handleEditClick('phone', 'Phone', profile.phone)} />
            <DetailRow icon={Mail} label="Email" value={profile.email || "Not provided"} editable onEdit={() => handleEditClick('email', 'Email', profile.email)} />
            <DetailRow icon={Calendar} label="Date of Birth" value={profile.date_of_birth || "Not provided"} editable onEdit={() => handleEditClick('date_of_birth', 'Date of Birth', profile.date_of_birth)} />
            <DetailRow icon={User} label="Father's Name" value={profile.father_name || "Not provided"} editable onEdit={() => handleEditClick('father_name', 'Father\'s Name', profile.father_name)} />
            <DetailRow icon={MapPin} label="Emergency Contact" value={profile.emergency_contact || "Not provided"} editable onEdit={() => handleEditClick('emergency_contact', 'Emergency Contact', profile.emergency_contact)} />
          </div>
        </CardContent>
      </Card>

      {/* Work Details */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden mb-6">
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border/30">
            <DetailRow icon={Briefcase} label="Shift Type" value={profile.shift_type || "Morning"} className="capitalize" locked />
            <DetailRow icon={Calendar} label="Joining Date" value={profile.joining_date || "Not provided"} editable onEdit={() => handleEditClick('joining_date', 'Joining Date', profile.joining_date)} />
            <DetailRow icon={Briefcase} label="Salary Divisor" value={`${profile.salary_divisor} days`} locked />
          </div>
        </CardContent>
      </Card>

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
    <div className="flex items-center justify-between p-4 bg-background">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-semibold text-foreground text-right ${className}`}>{value}</span>
        <div className="w-6 h-6 flex items-center justify-center shrink-0">
          {editable && (
            <button onClick={onEdit} className="p-1.5 bg-muted rounded-md text-primary" title="Request Edit">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {locked && (
            <button onClick={handleLockedClick} className="p-1.5 text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors" title="Fixed Field">
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
