import React from "react";
import { useEmployeePortalData } from "@/hooks/useEmployeePortalData";
import { Card, CardContent } from "@/components/ui/card";
import { User, Phone, Mail, MapPin, Briefcase, Calendar, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function PortalProfile() {
  const { data, isLoading } = useEmployeePortalData();

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

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Card */}
      <Card className="border-none shadow-sm bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-black shadow-lg shadow-primary/30">
              {profile.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{profile.name}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <Briefcase className="w-3.5 h-3.5" /> {profile.rank || "Employee"}
              </p>
              <Badge variant="outline" className="mt-2 bg-background/50 backdrop-blur-sm border-primary/20 text-primary text-[10px]">
                {profile.status === 'active' ? 'Active Employee' : profile.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Card */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border/30">
            <DetailRow icon={ShieldCheck} label="CNIC" value={profile.cnic || "Not provided"} />
            <DetailRow icon={Phone} label="Phone" value={profile.phone || "Not provided"} />
            <DetailRow icon={Mail} label="Email" value={profile.email || "Not provided"} />
            <DetailRow icon={Calendar} label="Date of Birth" value={profile.date_of_birth || "Not provided"} />
            <DetailRow icon={User} label="Father's Name" value={profile.father_name || "Not provided"} />
            <DetailRow icon={MapPin} label="Emergency Contact" value={profile.emergency_contact || "Not provided"} />
          </div>
        </CardContent>
      </Card>

      {/* Work Details */}
      <Card className="border-border/40 shadow-sm rounded-3xl overflow-hidden mb-6">
        <CardContent className="p-0">
          <div className="flex flex-col divide-y divide-border/30">
            <DetailRow icon={Briefcase} label="Shift Type" value={profile.shift_type || "Morning"} className="capitalize" />
            <DetailRow icon={Calendar} label="Joining Date" value={profile.joining_date || "Not provided"} />
            <DetailRow icon={Briefcase} label="Salary Divisor" value={`${profile.salary_divisor} days`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, className = "" }: { icon: any, label: string, value: string, className?: string }) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold text-foreground text-right ${className}`}>{value}</span>
    </div>
  );
}
