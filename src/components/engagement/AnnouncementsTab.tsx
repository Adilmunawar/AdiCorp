import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, Loader2, Edit2 } from "lucide-react";
import { format } from "date-fns";

export default function AnnouncementsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: profile } = useQuery({
    queryKey: ['admin-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['announcements', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !user?.id) throw new Error("Missing info");
      const { error } = await supabase.from('announcements').insert({
        company_id: profile.company_id,
        created_by: user.id,
        title: newTitle,
        content: newContent,
        is_active: true
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success("Announcement published successfully");
      setIsCreating(false);
      setNewTitle("");
      setNewContent("");
    },
    onError: (err: any) => toast.error(`Failed to publish: ${err.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success("Announcement deleted");
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="text-blue-500" size={20} /> Company Notice Board
          </h2>
          <p className="text-sm text-slate-500">Broadcast important messages to all employees.</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus size={16} /> New Announcement
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="border-blue-100 shadow-sm bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-base">Create Announcement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input 
                placeholder="e.g., Annual Company Retreat!" 
                value={newTitle} 
                onChange={(e) => setNewTitle(e.target.value)} 
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Message Content</Label>
              <Textarea 
                placeholder="Type your message here..." 
                value={newContent} 
                onChange={(e) => setNewContent(e.target.value)}
                className="min-h-[100px] bg-white"
              />
            </div>
          </CardContent>
          <CardFooter className="gap-2 justify-end">
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
            <Button 
              onClick={() => createMutation.mutate()} 
              disabled={!newTitle || !newContent || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Publish Now"}
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="space-y-4">
        {announcements?.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
            <Megaphone className="mx-auto mb-3 opacity-50" size={32} />
            <p>No active announcements.</p>
          </div>
        ) : (
          announcements?.map(ann => (
            <Card key={ann.id} className="relative overflow-hidden group">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{ann.title}</CardTitle>
                    <CardDescription className="mt-1">
                      Published on {format(new Date(ann.created_at), 'PPP')}
                    </CardDescription>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this announcement?')) {
                        deleteMutation.mutate(ann.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-700 whitespace-pre-wrap">{ann.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
