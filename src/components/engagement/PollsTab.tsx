import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { BarChart2, Plus, Trash2, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";

export default function PollsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const { data: profile } = useQuery({
    queryKey: ['admin-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  const { data: polls, isLoading } = useQuery({
    queryKey: ['admin-polls', profile?.company_id],
    queryFn: async () => {
      // Fetch polls
      const { data: pollsData, error: pollsError } = await supabase
        .from('polls')
        .select('*')
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: false });
      
      if (pollsError) throw pollsError;
      if (!pollsData || pollsData.length === 0) return [];

      const pollIds = pollsData.map(p => p.id);

      // Fetch options
      const { data: optionsData, error: optError } = await supabase
        .from('poll_options')
        .select('*')
        .in('poll_id', pollIds);
        
      if (optError) throw optError;

      // Fetch votes
      const { data: votesData, error: votesError } = await supabase
        .from('poll_votes')
        .select('*')
        .in('poll_id', pollIds);

      if (votesError) throw votesError;

      return pollsData.map(poll => {
        const pollOpts = optionsData?.filter(o => o.poll_id === poll.id) || [];
        const pollVotes = votesData?.filter(v => v.poll_id === poll.id) || [];
        const totalVotes = pollVotes.length;

        return {
          ...poll,
          options: pollOpts.map(opt => {
            const votesForOption = pollVotes.filter(v => v.option_id === opt.id).length;
            return {
              ...opt,
              voteCount: votesForOption,
              percentage: totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0
            };
          }),
          totalVotes
        };
      });
    },
    enabled: !!profile?.company_id
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !user?.id) throw new Error("Missing info");
      
      const validOptions = options.filter(o => o.trim() !== "");
      if (validOptions.length < 2) throw new Error("Need at least 2 options");
      if (!question.trim()) throw new Error("Question is required");

      const { data: poll, error: pollError } = await supabase.from('polls').insert({
        company_id: profile.company_id,
        created_by: user.id,
        question: question.trim(),
        status: 'active'
      }).select().single();

      if (pollError) throw pollError;

      const optionsToInsert = validOptions.map(opt => ({
        poll_id: poll.id,
        option_text: opt.trim()
      }));

      const { error: optError } = await supabase.from('poll_options').insert(optionsToInsert);
      if (optError) throw optError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-polls'] });
      toast.success("Poll created successfully");
      setIsCreating(false);
      setQuestion("");
      setOptions(["", ""]);
    },
    onError: (err: any) => toast.error(`Failed to create poll: ${err.message}`)
  });

  const closePollMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('polls').update({ status: 'closed' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-polls'] });
      toast.success("Poll closed");
    }
  });

  const deletePollMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('polls').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-polls'] });
      toast.success("Poll deleted");
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
            <BarChart2 className="text-purple-500" size={20} /> Team Polls
          </h2>
          <p className="text-sm text-slate-500">Create polls to gather feedback and votes from employees.</p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)} className="gap-2 bg-primary hover:bg-primary/90 shadow-sm rounded-xl">
            <Plus size={16} /> Create Poll
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="border-border/50 shadow-sm bg-slate-50/50 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">New Poll</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Question</label>
              <Input 
                placeholder="e.g., Where should we have our annual dinner?" 
                value={question} 
                onChange={(e) => setQuestion(e.target.value)} 
                className="bg-white font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Options</label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input 
                    placeholder={`Option ${i + 1}`} 
                    value={opt} 
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i] = e.target.value;
                      setOptions(newOpts);
                    }} 
                    className="bg-white"
                  />
                  {options.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => setOptions(options.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                      <X size={16} />
                    </Button>
                  )}
                </div>
              ))}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setOptions([...options, ""])} 
                className="mt-2 text-xs"
              >
                + Add Option
              </Button>
            </div>
          </CardContent>
          <CardFooter className="gap-2 justify-end">
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
            <Button 
              onClick={() => createMutation.mutate()} 
              disabled={createMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {createMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Publish Poll"}
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {polls?.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
            <BarChart2 className="mx-auto mb-3 opacity-50" size={32} />
            <p>No polls created yet.</p>
          </div>
        ) : (
          polls?.map(poll => (
            <Card key={poll.id} className={`rounded-2xl border-border/50 shadow-sm transition-all hover:shadow-md ${poll.status === 'closed' ? 'opacity-70 grayscale-[30%] bg-slate-50' : 'bg-white'}`}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-[15px] font-bold leading-tight">{poll.question}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {poll.status === 'active' ? '🟢 Active' : '🔴 Closed'} • {poll.totalVotes} total votes
                  </CardDescription>
                </div>
                <div className="flex gap-1 ml-4">
                  {poll.status === 'active' && (
                    <Button variant="secondary" size="sm" className="h-7 text-xs px-2" onClick={() => closePollMutation.mutate(poll.id)}>
                      Close
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => {
                    if(confirm("Delete this poll forever?")) deletePollMutation.mutate(poll.id);
                  }}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {poll.options.map(opt => (
                  <div key={opt.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{opt.option_text}</span>
                      <span className="text-slate-500">{opt.voteCount} votes ({opt.percentage}%)</span>
                    </div>
                    <Progress value={opt.percentage} className="h-2 bg-slate-100" indicatorClassName={poll.status === 'active' ? "bg-purple-500" : "bg-slate-400"} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
