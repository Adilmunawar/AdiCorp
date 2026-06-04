import React, { useState, useRef } from "react";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, User, Lock, Upload, Smartphone, Loader2 } from "lucide-react";

export default function PortalSettings() {
  const { employee, logout, updateSession } = useEmployeeAuth();
  const { data } = useEmployeePortalData();
  const navigate = useNavigate();
  
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profile = data?.profile;

  const handleLogout = () => {
    logout();
    navigate("/employee-login");
  };

  const handlePasswordChange = async () => {
    if (!oldPassword || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("update_employee_password", {
        p_emp_id: employee?.id,
        p_old_password: oldPassword,
        p_new_password: newPassword
      });

      if (error) throw error;
      const res = data as any;
      if (res.error) throw new Error(res.error);

      toast.success("Password changed securely!");
      setIsChangingPassword(false);
      setOldPassword("");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${employee?.id}-avatar-${Date.now()}.${fileExt}`;
      const filePath = `${employee?.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('employee-documents')
        .getPublicUrl(filePath);

      // Submit an update request for the avatar so Admin can approve it
      const { error: updateError } = await supabase.rpc("submit_update_request", {
        p_emp_id: employee?.id,
        p_changes: { avatar_url: publicUrlData.publicUrl }
      });

      if (updateError) throw updateError;

      toast.success('Avatar update request submitted to HR for approval.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-8">
      <div className="px-2 mb-4">
        <h2 className="text-xl font-black tracking-tight text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground mt-1">Manage your account and preferences.</p>
      </div>

      {/* Avatar & Basic Info */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {employee?.avatar_url ? (
                <img src={employee.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-black shadow-inner">
                  {employee?.name?.substring(0, 2).toUpperCase()}
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-background border border-border/50 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-110 transition-transform"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div>
              <h3 className="font-bold text-foreground">{employee?.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{profile?.email || "No email added"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden mt-6">
        <div className="bg-muted/30 px-5 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Security
          </h3>
        </div>
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border/30">
            <button 
              onClick={() => setIsChangingPassword(true)}
              className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Change Password</p>
                <p className="text-xs text-muted-foreground mt-0.5">Update your secure login password</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Lock className="w-4 h-4" />
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Session Details */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden mt-6">
        <div className="bg-muted/30 px-5 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> Sessions
          </h3>
        </div>
        <CardContent className="p-0">
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-green-500/10 text-green-600 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Current Device</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active now • Mobile Browser</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button 
        variant="destructive" 
        className="w-full h-12 rounded-2xl font-bold tracking-wide shadow-md shadow-destructive/20 mt-8"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4 mr-2" /> Secure Logout
      </Button>

      {/* Password Change Dialog */}
      <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
        <DialogContent className="sm:max-w-md w-[90%] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground ml-1">Current Password</label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="h-12 bg-muted/50 rounded-xl border-transparent focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground ml-1">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-12 bg-muted/50 rounded-xl border-transparent focus:border-primary"
              />
            </div>
            <Button 
              onClick={handlePasswordChange} 
              disabled={isSubmitting || !oldPassword || !newPassword}
              className="w-full h-11 rounded-xl shadow-md font-bold mt-2"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
