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
import { LogOut, Lock, Upload, Smartphone, Loader2, Trash2, ShieldCheck, UserCog, Settings as SettingsIcon } from "lucide-react";

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

      const { error: updateError } = await supabase
        .from('employees')
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq('id', employee?.id);

      if (updateError) throw updateError;

      updateSession({ avatar_url: publicUrlData.publicUrl });
      toast.success('Profile picture updated successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    try {
      const { error: updateError } = await supabase
        .from('employees')
        .update({ avatar_url: null })
        .eq('id', employee?.id);

      if (updateError) throw updateError;

      updateSession({ avatar_url: undefined });
      toast.success('Profile picture removed successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove avatar');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12 max-w-2xl mx-auto">
      {/* Header */}
      <div className="px-2 mb-6 mt-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-2xl">
            <SettingsIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">Preferences</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your account and security settings</p>
          </div>
        </div>
      </div>

      {/* Professional Profile Identity Card */}
      <Card className="border border-border/50 shadow-sm rounded-3xl overflow-hidden bg-card">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            
            {/* Avatar Section */}
            <div className="shrink-0 relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border border-border shadow-sm">
                {employee?.avatar_url ? (
                  <img src={employee.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary/10 text-primary flex items-center justify-center text-3xl font-black">
                    {employee?.name?.substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            
            {/* Identity Details & Actions */}
            <div className="flex-1 flex flex-col justify-center items-center sm:items-start text-center sm:text-left pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <UserCog className="w-3 h-3" /> Identity Profile
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-foreground">{employee?.name}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {profile?.email || "No email linked to this account"}
              </p>
              
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-5 w-full">
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  variant="outline"
                  className="rounded-xl font-semibold h-10 shadow-sm"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2 text-primary" />}
                  Upload Picture
                </Button>
                
                {employee?.avatar_url && (
                  <Button 
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    variant="ghost"
                    className="rounded-xl font-semibold h-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            
          </div>
        </CardContent>
      </Card>

      {/* Security Settings Section */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest px-2">Account Security</h3>
        
        <Card className="border border-border/50 shadow-md rounded-3xl overflow-hidden bg-card/60 backdrop-blur-xl group hover:shadow-lg hover:border-primary/30 transition-all duration-500">
          <CardContent className="p-0">
            <button 
              onClick={() => setIsChangingPassword(true)}
              className="w-full flex items-center justify-between p-6 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all duration-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground tracking-tight">Change Password</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Update your secure login credentials</p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Details */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest px-2">Active Sessions</h3>
        
        <Card className="border border-border/50 shadow-md rounded-3xl overflow-hidden bg-card/60 backdrop-blur-xl hover:shadow-lg transition-all duration-500">
          <CardContent className="p-0">
            <div className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold text-foreground tracking-tight">Current Device</p>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-500/20">Active</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Mobile Browser • Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logout Area */}
      <div className="pt-6">
        <Button 
          variant="destructive" 
          className="w-full h-14 rounded-2xl font-black text-base tracking-wide shadow-lg shadow-destructive/20 hover:shadow-destructive/40 transition-all duration-300 hover:-translate-y-1"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-3" /> Securely Logout
        </Button>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
        <DialogContent className="sm:max-w-md w-[90%] rounded-[2rem] border-border/50 shadow-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 border-b border-border/50">
            <DialogHeader className="text-left space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary mb-2 shadow-sm border border-primary/20">
                <Lock className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-black">Change Password</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground font-medium">
                Enter your current password and choose a secure new one to protect your account.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 space-y-5 bg-card/50 backdrop-blur-xl">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ml-1">Current Password</label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="h-12 bg-background border-border/50 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest ml-1">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-12 bg-background border-border/50 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                placeholder="At least 6 characters"
              />
            </div>
            <Button 
              onClick={handlePasswordChange} 
              disabled={isSubmitting || !oldPassword || !newPassword}
              className="w-full h-12 rounded-xl shadow-lg shadow-primary/20 font-black tracking-wide mt-4 hover:-translate-y-0.5 transition-transform"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
