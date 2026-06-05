import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, AlertCircle, ShieldAlert, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function PortalComplaintsTab() {
  const { employee } = useEmployeeAuth();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Fetch only non-anonymous complaints or all if we decided to link them. 
  // Based on the SQL policy, they can only see complaints where employee_id = their id.
  const { data: myComplaints, isLoading } = useQuery({
    queryKey: ['portal-complaints', employee?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('employee_get_complaints', {
        p_emp_id: employee?.id
      });
      
      if (error) throw error;
      return data as any[];
    },
    enabled: !!employee?.id
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!employee?.company_id) throw new Error("Missing company info");
      
      const { error } = await supabase.rpc('employee_submit_complaint', {
        p_company_id: employee.company_id,
        p_emp_id: employee.id,
        p_subject: subject,
        p_description: description,
        p_is_anonymous: isAnonymous
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-complaints'] });
      toast.success(isAnonymous ? "Anonymous issue submitted safely." : "Issue submitted successfully.");
      setSubject("");
      setDescription("");
      setIsAnonymous(false);
    },
    onError: (err: any) => toast.error(`Failed to submit: ${err.message}`)
  });

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="text-amber-500" size={18} />
            Report an Issue
          </CardTitle>
          <CardDescription className="text-xs">
            Submit a grievance, complaint, or report an issue. HR will review it.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input 
              placeholder="Brief title of the issue" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-slate-50 border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea 
              placeholder="Provide details about what happened..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-50 border-slate-200 min-h-[100px]"
            />
          </div>
          
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100 mt-2">
            <div className="flex gap-2">
              <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={16} />
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold text-amber-900">Submit Anonymously</Label>
                <p className="text-[10px] text-amber-700 leading-tight pr-4">
                  Your identity will be completely hidden from HR. You won't be able to track this ticket later.
                </p>
              </div>
            </div>
            <Switch 
              checked={isAnonymous} 
              onCheckedChange={setIsAnonymous}
            />
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button 
            className="w-full gap-2" 
            disabled={!subject.trim() || !description.trim() || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit Report
          </Button>
        </CardFooter>
      </Card>

      {/* Only show tracking if they have non-anonymous complaints */}
      {myComplaints && myComplaints.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold px-1 text-slate-700">Your Tracked Issues</h3>
          {myComplaints.map(comp => (
            <Card key={comp.id} className="border-0 shadow-sm bg-white">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-sm">{comp.subject}</h4>
                  <Badge variant="outline" className={
                    comp.status === 'resolved' ? 'border-green-200 text-green-700 bg-green-50' :
                    comp.status === 'investigating' ? 'border-blue-200 text-blue-700 bg-blue-50' :
                    'border-amber-200 text-amber-700 bg-amber-50'
                  }>
                    {comp.status}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mb-2 line-clamp-2">{comp.description}</p>
                <p className="text-[10px] text-slate-400">Submitted on {format(new Date(comp.created_at), 'PP')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
