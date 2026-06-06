import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, User, Search, MessageCircle, Info, Phone, Mail, Calendar, Clock, BadgeCheck } from "lucide-react";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
        .select('id, name, rank, user_id, phone, email, shift_type, joining_date, cnic, status, avatar_url')
        .eq('company_id', profile?.company_id)
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id
  });

  // Fetch unread messages for admin
  const { data: unreadMessages } = useQuery({
    queryKey: ['admin-unread-messages', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 3000
  });

  // Mark as read effect
  useEffect(() => {
    if (selectedEmployeeId && user?.id) {
      const hasUnreadFromSelected = unreadMessages?.some(m => m.sender_id === selectedEmployeeId);
      if (hasUnreadFromSelected) {
        supabase.from('messages')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .eq('sender_id', selectedEmployeeId)
          .eq('is_read', false)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['admin-unread-messages'] });
            queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedEmployeeId] });
          });
      }
    }
  }, [selectedEmployeeId, user?.id, unreadMessages, queryClient]);

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
              {filteredEmployees.map(emp => {
                const unreadCount = unreadMessages?.filter(m => m.sender_id === emp.id).length || 0;
                
                return (
                  <button
                    key={emp.id}
                    onClick={() => {
                      setSelectedEmployeeId(emp.id);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                      selectedEmployeeId === emp.id 
                        ? 'bg-blue-50 border border-blue-100 shadow-sm' 
                        : 'hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
                        selectedEmployeeId === emp.id ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt={emp.name} className="w-full h-full object-cover" />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="font-medium text-sm truncate">{emp.name}</h4>
                        <p className={`text-xs truncate ${selectedEmployeeId === emp.id ? 'text-blue-500' : 'text-slate-500'}`}>
                          {emp.rank}
                        </p>
                      </div>
                    </div>
                    {unreadCount > 0 && (
                      <div className="bg-red-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full shrink-0">
                        {unreadCount}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Content - Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-50 relative">
        {selectedEmployeeId ? (
          <>
            <div className="p-3 border-b border-border/40 bg-[#f0f2f5] flex items-center gap-3 shadow-sm z-10 shrink-0">
              <div className="w-10 h-10 rounded-full bg-slate-300 text-white flex items-center justify-center overflow-hidden shrink-0">
                {employees?.find(e => e.id === selectedEmployeeId)?.avatar_url ? (
                  <img src={employees.find(e => e.id === selectedEmployeeId)?.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="mt-2" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-[#111b21] text-[15px] leading-tight">
                  {employees?.find(e => e.id === selectedEmployeeId)?.name}
                </h3>
                <p className="text-[12px] text-slate-500">
                  {employees?.find(e => e.id === selectedEmployeeId)?.rank}
                </p>
              </div>
              
              <Sheet>
                <SheetTrigger asChild>
                  <button className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors" title="Employee Info">
                    <Info size={20} />
                  </button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[450px] bg-[#f0f2f5] p-0 border-l border-slate-300">
                  <div className="h-[60px] bg-[#f0f2f5] flex items-center px-6">
                    <SheetTitle className="text-base font-medium text-slate-800">Employee Info</SheetTitle>
                  </div>
                  
                  <div className="overflow-y-auto h-[calc(100vh-60px)]">
                    <div className="bg-white flex flex-col items-center py-8 px-6 shadow-sm mb-2">
                      <div className="w-48 h-48 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center mb-4 overflow-hidden shadow-sm border-4 border-white ring-1 ring-slate-100">
                        {employees?.find(e => e.id === selectedEmployeeId)?.avatar_url ? (
                          <img src={employees.find(e => e.id === selectedEmployeeId)?.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User size={80} className="mt-8" />
                        )}
                      </div>
                      <h2 className="text-2xl font-normal text-slate-800 mb-1">{employees?.find(e => e.id === selectedEmployeeId)?.name}</h2>
                      <p className="text-slate-500 text-sm">{employees?.find(e => e.id === selectedEmployeeId)?.rank}</p>
                    </div>

                    <div className="bg-white px-6 py-4 shadow-sm space-y-4 mb-2">
                      <h3 className="text-[14px] text-[#00a884] font-medium mb-2">About</h3>
                      
                      <div className="flex items-start gap-4">
                        <Phone className="text-slate-400 mt-1" size={20} />
                        <div className="flex-1 border-b border-slate-100 pb-3">
                          <p className="text-[15px] text-slate-800">{employees?.find(e => e.id === selectedEmployeeId)?.phone || 'Not provided'}</p>
                          <p className="text-[13px] text-slate-500">Phone</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <Mail className="text-slate-400 mt-1" size={20} />
                        <div className="flex-1 border-b border-slate-100 pb-3">
                          <p className="text-[15px] text-slate-800">{employees?.find(e => e.id === selectedEmployeeId)?.email || 'Not provided'}</p>
                          <p className="text-[13px] text-slate-500">Email</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <BadgeCheck className="text-slate-400 mt-1" size={20} />
                        <div className="flex-1 border-b border-slate-100 pb-3">
                          <p className="text-[15px] text-slate-800">{employees?.find(e => e.id === selectedEmployeeId)?.cnic || 'Not provided'}</p>
                          <p className="text-[13px] text-slate-500">CNIC</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <Calendar className="text-slate-400 mt-1" size={20} />
                        <div className="flex-1 border-b border-slate-100 pb-3">
                          <p className="text-[15px] text-slate-800">
                            {employees?.find(e => e.id === selectedEmployeeId)?.joining_date 
                              ? format(new Date(employees.find(e => e.id === selectedEmployeeId)!.joining_date), 'MMMM d, yyyy') 
                              : 'Unknown'}
                          </p>
                          <p className="text-[13px] text-slate-500">Joining Date</p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-4">
                        <Clock className="text-slate-400 mt-1" size={20} />
                        <div className="flex-1 pb-1">
                          <p className="text-[15px] text-slate-800 capitalize">{employees?.find(e => e.id === selectedEmployeeId)?.shift_type || 'Unknown'} Shift</p>
                          <p className="text-[13px] text-slate-500">Shift Type</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
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
                messages?.map((msg, index) => {
                  const isMe = msg.sender_id === user?.id;
                  const isFirstInGroup = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id;
                  
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`relative max-w-[80%] px-3 py-1.5 shadow-sm transition-all ${
                        isMe 
                          ? `bg-primary text-primary-foreground rounded-2xl ${isFirstInGroup ? 'rounded-tr-sm' : ''}` 
                          : `bg-white text-slate-800 border border-slate-100 rounded-2xl ${isFirstInGroup ? 'rounded-tl-sm' : ''}`
                      }`}>
                        {/* Message Tail SVG */}
                        {isFirstInGroup && isMe && (
                          <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-[7px] text-primary">
                            <path opacity=".13" fill="#0000000" d="M1.533 3.118L8 12.114V1.913a1.914 1.914 0 0 0-1.913-1.913H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                            <path fill="currentColor" d="M1.533 2.568L8 11.564V1.363a1.364 1.364 0 0 0-1.363-1.363H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                          </svg>
                        )}
                        {isFirstInGroup && !isMe && (
                          <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-[7px] text-white transform -scale-x-100">
                            <path opacity=".13" fill="#0000000" d="M1.533 3.118L8 12.114V1.913a1.914 1.914 0 0 0-1.913-1.913H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                            <path fill="currentColor" d="M1.533 2.568L8 11.564V1.363a1.364 1.364 0 0 0-1.363-1.363H.123c-1.393 0-2.035 1.745-.98 2.668l2.39 2.45z"></path>
                          </svg>
                        )}

                        <p className="text-[14.5px] leading-snug whitespace-pre-wrap pr-16 pb-2 break-words">{msg.content}</p>
                        <div className="absolute bottom-1 right-2 flex items-center gap-1">
                          <span className={`text-[10px] leading-none select-none ${isMe ? 'text-primary-foreground/80' : 'text-slate-500'}`}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
                          {isMe && (
                            <span className={`text-[14px] leading-none select-none ${msg.is_read ? 'text-blue-200' : 'text-primary-foreground/50'}`}>
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 bg-white shrink-0 border-t border-border/40">
              <form onSubmit={handleSend} className="flex gap-2 w-full max-w-4xl mx-auto items-end">
                <Input
                  placeholder="Type a message"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="bg-slate-50 rounded-2xl border-slate-200 focus-visible:ring-0 shadow-none h-11 px-4 text-[15px]"
                />
                <Button type="submit" size="icon" disabled={!messageText.trim() || sendMutation.isPending} className="rounded-full h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
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
