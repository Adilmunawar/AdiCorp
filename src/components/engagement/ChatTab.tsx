import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, User, Search, MessageCircle } from "lucide-react";
import { format } from "date-fns";

export default function ChatTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['admin-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user?.id).single();
      return data;
    },
    enabled: !!user
  });

  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['chat-employees', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, rank, user_id')
        .eq('company_id', profile?.company_id)
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id
  });

  // Fetch messages for the selected user
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', selectedEmployeeId],
    queryFn: async () => {
      if (!selectedEmployeeId || !user?.id) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedEmployeeId}),and(sender_id.eq.${selectedEmployeeId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEmployeeId && !!user?.id,
    staleTime: 0
  });

  // Realtime subscription
  useEffect(() => {
    if (!selectedEmployeeId || !user?.id) return;

    const channel = supabase.channel('messages_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      }, (payload) => {
        // Invalidate all chat messages to ensure fresh data when switching tabs
        queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedEmployeeId, user?.id, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !user?.id || !selectedEmployeeId || !messageText.trim()) return;
      const { error } = await supabase.from('messages').insert({
        company_id: profile.company_id,
        sender_id: user.id,
        receiver_id: selectedEmployeeId,
        content: messageText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      setMessageText("");
    }
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMutation.mutate();
  };

  const filteredEmployees = employees?.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.rank?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="flex h-[calc(100vh-240px)] min-h-[500px] border border-border/60 rounded-2xl bg-white overflow-hidden shadow-sm">
      {/* Left Sidebar - Employee List */}
      <div className="w-1/3 border-r border-border/60 flex flex-col bg-slate-50/30">
        <div className="p-4 border-b border-border/60 bg-white/50 backdrop-blur-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search employees..." 
              className="pl-9 h-9 bg-slate-50"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {employeesLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelectedEmployeeId(emp.id);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedEmployeeId === emp.id 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    selectedEmployeeId === emp.id ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    <User size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-medium text-sm truncate">{emp.name}</h4>
                    <p className={`text-xs truncate ${selectedEmployeeId === emp.id ? 'text-blue-500' : 'text-slate-500'}`}>
                      {emp.rank}
                    </p>
                  </div>
                  {/* Unread indicator could go here if we fetch unread counts */}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Content - Chat Window */}
      <div className="flex-1 flex flex-col bg-[#efeae2] relative">
        {selectedEmployeeId ? (
          <>
            <div className="p-3 border-b border-border/40 bg-[#f0f2f5] flex items-center gap-3 shadow-sm z-10 shrink-0">
              <div className="w-10 h-10 rounded-full bg-slate-300 text-white flex items-center justify-center overflow-hidden">
                <User size={20} className="mt-2" />
              </div>
              <div>
                <h3 className="font-semibold text-[#111b21] text-[15px] leading-tight">
                  {employees?.find(e => e.id === selectedEmployeeId)?.name}
                </h3>
                <p className="text-[12px] text-slate-500">
                  {employees?.find(e => e.id === selectedEmployeeId)?.rank}
                </p>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-3"
            >
              {messagesLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#00a884]" /></div>
              ) : messages?.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 bg-white/60 mx-auto max-w-sm rounded-2xl p-6 backdrop-blur-sm shadow-sm mt-10">
                  <MessageCircle size={40} className="text-[#00a884]/40" />
                  <p className="text-sm font-medium text-center">No messages yet. Send a message to start the conversation.</p>
                </div>
              ) : (
                messages?.map(msg => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`relative max-w-[75%] px-3 py-1.5 shadow-sm ${
                        isMe 
                          ? 'bg-[#d9fdd3] text-[#111b21] rounded-2xl rounded-tr-sm' 
                          : 'bg-white text-[#111b21] rounded-2xl rounded-tl-sm'
                      }`}>
                        <p className="text-[14.5px] leading-snug whitespace-pre-wrap pr-12 pb-1.5">{msg.content}</p>
                        <span className="text-[10px] text-slate-500 absolute bottom-1.5 right-2">
                          {format(new Date(msg.created_at), 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 bg-[#f0f2f5] shrink-0 border-t border-border/40">
              <form onSubmit={handleSend} className="flex gap-2 w-full max-w-4xl mx-auto items-end">
                <Input
                  placeholder="Type a message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="bg-white rounded-2xl border-0 focus-visible:ring-0 shadow-sm h-11 px-4 text-[15px]"
                />
                <Button type="submit" size="icon" disabled={!messageText.trim() || sendMutation.isPending} className="rounded-full h-11 w-11 shrink-0 bg-[#00a884] hover:bg-[#008f6f] text-white shadow-sm">
                  {sendMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <User size={64} className="opacity-10 mb-4" />
            <p className="text-lg font-medium text-slate-500">Select an employee</p>
            <p className="text-sm">Choose an employee from the sidebar to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
