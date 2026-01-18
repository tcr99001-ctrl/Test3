'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Play, Users, Crown, Copy, CheckCircle2, Link as LinkIcon, 
  Smile, Zap, Trophy, Timer, ArrowRight, RefreshCw, AlertCircle, 
  Megaphone, Hand, Gavel, XCircle, MessageCircle
} from 'lucide-react';

// ==================================================================
// [필수] 사용자님의 Firebase 설정값 (기존 유지)
// ==================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBPd5xk9UseJf79GTZogckQmKKwwogneco",
  authDomain: "test-4305d.firebaseapp.com",
  projectId: "test-4305d",
  storageBucket: "test-4305d.firebasestorage.app",
  messagingSenderId: "402376205992",
  appId: "1:402376205992:web:be662592fa4d5f0efb849d"
};

// --- Firebase Init ---
let firebaseApp;
let db;
let auth;
let initError = null;

try {
  if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApps()[0];
  }
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
} catch (e) { 
  initError = e.message;
}

// --- Constants ---
const TOPICS = [
  "편의점", "겨울 간식", "빨간색 물건", "라면에 넣는 것", "영화관", 
  "놀이공원", "해외여행지", "치킨 브랜드", "한국의 도시", "초능력",
  "무인도에 가져갈 것", "잠 안 올 때 하는 일", "비 오는 날", "결혼식", "크리스마스",
  "학창시절", "다이어트", "여름 방학", "공포영화 클리셰", "삼겹살 짝꿍",
  "편의점 꿀조합", "카페 메뉴", "취미 생활", "마트에서 사는 것", "운동",
  "동물원", "캠핑 용품", "소확행", "아르바이트", "찜질방"
];
const ROUND_TIME = 60;

const vibrate = () => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30); };

export default function SpeakerDrivenNeodoNado() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myAnswers, setMyAnswers] = useState(['', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(initError);
  const [copyStatus, setCopyStatus] = useState(null);

  const isJoined = user && players.some(p => p.id === user.uid);
  const isHost = roomData?.hostId === user?.uid;
  
  // 현재 발표자인지 확인
  const currentSpeaker = players[roomData?.currentSpeakerIndex];
  const isMyTurn = currentSpeaker?.id === user?.uid;

  // --- Auth & Data Sync ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('room');
      if (code && code.length === 4) setRoomCode(code.toUpperCase());
    }
    if(!auth) return;
    const unsub = onAuthStateChanged(auth, u => {
      if(u) setUser(u);
      else signInAnonymously(auth).catch(e => setError("로그인 실패: "+e.message));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if(!user || !roomCode || roomCode.length!==4 || !db) return;
    
    const unsubRoom = onSnapshot(doc(db,'rooms',roomCode), s => {
      if(s.exists()) {
        const data = s.data();
        setRoomData(data);
        if (data.status === 'playing' && data.endTime) {
          const diff = Math.ceil((data.endTime - Date.now()) / 1000);
          setTimeLeft(diff > 0 ? diff : 0);
        }
      } else setRoomData(null);
    });

    const unsubPlayers = onSnapshot(collection(db,'rooms',roomCode,'players'), s => {
      const list=[]; s.forEach(d=>list.push({id:d.id, ...d.data()}));
      setPlayers(list);
    });
    return () => { unsubRoom(); unsubPlayers(); };
  }, [user, roomCode]);

  // --- Timer ---
  useEffect(() => {
    if (roomData?.status === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(timer);
    }
    if (roomData?.status === 'playing' && timeLeft === 0 && isHost) {
      startDiscussionPhase();
    }
  }, [roomData?.status, timeLeft, isHost]);

  // --- Presence ---
  useEffect(() => {
    if(!isJoined || !roomCode || !user) return;
    const hb = async () => { try { await updateDoc(doc(db,'rooms',roomCode,'players',user.uid), { lastActive: Date.now() }); } catch(e){} };
    hb();
    const t = setInterval(hb, 5000);
    return () => clearInterval(t);
  }, [isJoined, roomCode, user]);

  useEffect(() => {
    if(!isHost || !players.length) return;
    const cl = setInterval(() => {
      const now = Date.now();
      players.forEach(async p => {
        if(p.lastActive && now - p.lastActive > 20000) try { await deleteDoc(doc(db,'rooms',roomCode,'players',p.id)); } catch(e){}
      });
    }, 10000);
    return () => clearInterval(cl);
  }, [isHost, players, roomCode]);

  // --- Actions ---
  const handleCreate = async () => {
    if(!playerName) return setError("이름을 입력하세요");
    vibrate();
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, status: 'lobby', round: 0,
      topic: '', endTime: 0, 
      currentSpeakerIndex: 0, currentActiveWord: null, submittedMatches: [], 
      createdAt: Date.now()
    });
    await setDoc(doc(db,'rooms',code,'players',user.uid), { name: playerName, score: 0, joinedAt: Date.now(), lastActive: Date.now() });
    setRoomCode(code);
  };

  const handleJoin = async () => {
    if(!playerName || roomCode.length!==4) return setError("정보를 확인하세요");
    vibrate();
    const snap = await getDoc(doc(db,'rooms',roomCode));
    if(!snap.exists()) return setError("방이 없습니다");
    await setDoc(doc(db,'rooms',roomCode,'players',user.uid), { name: playerName, score: 0, joinedAt: Date.now(), lastActive: Date.now() });
  };

  const handleStartRound = async () => {
    vibrate();
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const endTime = Date.now() + (ROUND_TIME * 1000);
    
    const resetUpdates = players.map(p => updateDoc(doc(db,'rooms',roomCode,'players',p.id), { currentAnswers: null, scoredWords: [] }));
    await Promise.all(resetUpdates);

    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'playing', topic, endTime, 
      round: (roomData.round || 0) + 1,
      currentSpeakerIndex: 0,
      currentActiveWord: null,
      submittedMatches: []
    });
    setMyAnswers(['','','','','']);
  };

  const submitAnswers = async () => {
    vibrate();
    const validAnswers = myAnswers.map(a => a.trim()).filter(a => a !== "");
    await updateDoc(doc(db,'rooms',roomCode,'players',user.uid), {
      currentAnswers: validAnswers
    });
  };

  // --- Discussion Phase Logic ---
  
  const startDiscussionPhase = async () => {
    if(!isHost) return;
    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'discussion',
      currentSpeakerIndex: 0,
      currentActiveWord: null,
      submittedMatches: []
    });
  };

  // 1. 발표자: 단어 선택하여 발표하기
  const announceWord = async (word) => {
    vibrate();
    await updateDoc(doc(db, 'rooms', roomCode), {
      currentActiveWord: word,
      submittedMatches: [] 
    });
  };

  // 2. 청중: 내 단어 제출하기 (공감)
  const submitMatch = async (word) => {
    vibrate();
    const alreadySubmitted = roomData.submittedMatches?.some(m => m.uid === user.uid);
    if(alreadySubmitted) return;

    const newMatches = [...(roomData.submittedMatches || []), { uid: user.uid, name: playerName, word: word }];
    await updateDoc(doc(db, 'rooms', roomCode), {
      submittedMatches: newMatches
    });
  };

  // 3. [권한 변경됨] 발표자: 이상한 답변 반려시키기
  const rejectMatch = async (targetUid) => {
    if(!isMyTurn) return; // 발표자만 가능
    vibrate();
    const newMatches = roomData.submittedMatches.filter(m => m.uid !== targetUid);
    await updateDoc(doc(db, 'rooms', roomCode), {
      submittedMatches: newMatches
    });
  };

  // 4. [권한 변경됨] 발표자: 점수 확정 및 턴 넘기기
  const confirmScoreAndNext = async () => {
    if(!isMyTurn || !roomData.currentActiveWord) return; // 발표자만 가능
    vibrate();

    const matchCount = roomData.submittedMatches.length;
    const scoreToAdd = 1 + matchCount; 

    const speaker = players[roomData.currentSpeakerIndex];
    if (speaker) {
      const newScored = [...(speaker.scoredWords || []), roomData.currentActiveWord];
      await updateDoc(doc(db, 'rooms', roomCode, 'players', speaker.id), {
        score: (speaker.score || 0) + scoreToAdd,
        scoredWords: newScored
      });
    }

    const matchUpdates = roomData.submittedMatches.map(match => {
      const p = players.find(player => player.id === match.uid);
      if(p) {
        const newScored = [...(p.scoredWords || []), match.word];
        return updateDoc(doc(db, 'rooms', roomCode, 'players', p.id), {
          score: (p.score || 0) + scoreToAdd,
          scoredWords: newScored
        });
      }
      return null;
    });
    await Promise.all(matchUpdates);

    // 다음 턴으로
    let nextIndex = (roomData.currentSpeakerIndex + 1) % players.length;
    
    await updateDoc(doc(db, 'rooms', roomCode), {
      currentActiveWord: null,
      submittedMatches: [],
      currentSpeakerIndex: nextIndex
    });
  };

  // 5. 라운드 종료 (방장 수동) - 이건 방장이 하는 게 맞습니다 (흐름 제어)
  const finishRound = async () => {
    if(!isHost) return;
    if(!window.confirm("모든 단어 확인이 끝났나요? 결과를 보러 갑니다.")) return;
    await updateDoc(doc(db, 'rooms', roomCode), { status: 'result' });
  };

  // --- UI Helpers ---
  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin.split('?')[0]}?room=${roomCode}`;
    const el = document.createElement('textarea');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopyStatus('link');
    setTimeout(() => setCopyStatus(null), 2000);
    vibrate();
  };

  const handleInputChange = (idx, val) => {
    const newArr = [...myAnswers];
    newArr[idx] = val;
    setMyAnswers(newArr);
  };

  const myPlayer = players.find(p => p.id === user?.uid);
  const isSubmitted = myPlayer?.currentAnswers;

  // --- RENDER ---
  if(!user) return <div className="h-screen flex items-center justify-center bg-yellow-50 font-bold text-yellow-600">Loading...</div>;

  return (
    <div className="min-h-screen bg-yellow-50 text-slate-800 font-sans relative overflow-x-hidden selection:bg-yellow-200">
      
      <header className="bg-white border-b-4 border-yellow-400 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-yellow-400 rounded-xl text-white shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
            <Zap size={24} fill="currentColor"/>
          </div>
          <div><h1 className="text-xl font-black tracking-tight text-slate-800">너도나도</h1></div>
        </div>
        {isJoined && roomCode && <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-lg font-black">{roomCode}</div>}
      </header>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-100 border-2 border-red-200 rounded-2xl flex items-center gap-3 text-red-600 font-bold">
          <AlertCircle size={20} /> <span className="text-sm">{error}</span> <button onClick={()=>setError(null)} className="ml-auto">✕</button>
        </div>
      )}

      {/* 1. Entrance */}
      {!isJoined && (
        <div className="p-6 max-w-md mx-auto mt-10 animate-in fade-in zoom-in-95">
          <div className="bg-white p-8 rounded-[2rem] shadow-[8px_8px_0px_rgba(0,0,0,0.1)] border-4 border-slate-100 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-black text-slate-800 mb-1">공감 게임</h2>
              <p className="text-slate-400 text-sm font-bold">텔레파시가 통하는 친구는?</p>
            </div>
            <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="닉네임" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-5 py-4 text-lg font-bold outline-none focus:border-yellow-400 transition-all"/>
            {!roomCode && <button onClick={handleCreate} className="w-full bg-yellow-400 hover:bg-yellow-500 text-white py-4 rounded-xl font-black text-xl shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] transition-all">방 만들기</button>}
            <div className="flex gap-3">
              <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="코드" maxLength={4} className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl text-center font-mono font-black text-xl outline-none focus:border-yellow-400"/>
              <button onClick={handleJoin} className="flex-[1.5] bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold shadow-[4px_4px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.2)] transition-all">입장</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Lobby */}
      {isJoined && roomData?.status === 'lobby' && (
        <div className="p-6 max-w-md mx-auto space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-white p-6 rounded-[2rem] border-4 border-blue-100 shadow-xl flex justify-between items-center">
            <div><p className="text-blue-400 text-xs font-black uppercase tracking-widest">Players</p><h2 className="text-4xl font-black text-slate-800">{players.length} <span className="text-xl text-slate-300">/ 20</span></h2></div>
            <Users size={40} className="text-blue-200"/>
          </div>
          <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-4 min-h-[300px] flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-400 uppercase">대기 명단</span>
              <button onClick={copyInviteLink} className="text-[10px] font-bold text-white bg-slate-800 px-3 py-1.5 rounded-full flex gap-1 hover:bg-slate-700 transition-colors">{copyStatus==='link'?<CheckCircle2 size={12}/>:<LinkIcon size={12}/>} 초대 링크</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {players.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${p.id===user.uid?'bg-blue-500':'bg-slate-300'}`}></div><span className={`font-bold ${p.id===user.uid ? 'text-blue-600' : 'text-slate-600'}`}>{p.name}</span></div>
                  <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">{p.score}점</span>{p.id===roomData.hostId && <Crown size={16} className="text-yellow-500" />}</div>
                </div>
              ))}
            </div>
          </div>
          {isHost ? <button onClick={handleStartRound} className="w-full bg-blue-500 hover:bg-blue-600 text-white p-5 rounded-2xl font-black text-xl shadow-[0_8px_20px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-all"><Play size={24} fill="currentColor"/> 게임 시작</button> : <div className="text-center text-slate-400 font-bold animate-pulse py-4">방장이 곧 시작합니다...</div>}
        </div>
      )}

      {/* 3. Input Phase */}
      {isJoined && roomData?.status === 'playing' && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto pb-20">
          <div className="bg-white border-2 border-yellow-400 p-6 rounded-3xl shadow-[4px_4px_0px_#facc15] text-center mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100"><div className="h-full bg-yellow-400 transition-all duration-1000" style={{width: `${(timeLeft/ROUND_TIME)*100}%`}}></div></div>
            <p className="text-yellow-500 text-xs font-black uppercase tracking-widest mb-1">주제어</p>
            <h2 className="text-3xl font-black text-slate-800 break-keep leading-tight">{roomData.topic}</h2>
            <div className="absolute top-4 right-4 flex items-center gap-1 text-slate-400 font-mono font-bold"><Timer size={16}/> {timeLeft}</div>
          </div>
          {!isSubmitted ? (
            <div className="flex-1 space-y-3 overflow-y-auto pb-4">
              <p className="text-center text-slate-400 text-xs font-bold mb-2">떠오르는 단어 5개를 적으세요!</p>
              {myAnswers.map((ans, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-6 text-center font-black text-slate-300">{idx+1}</span>
                  <input value={ans} onChange={e => handleInputChange(idx, e.target.value)} className="flex-1 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none transition-all shadow-sm" placeholder="..."/>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-500 animate-bounce"><CheckCircle2 size={40} /></div>
              <h3 className="text-xl font-black text-slate-700">제출 완료!</h3>
              <p className="text-slate-400 text-sm font-bold">다른 친구들을 기다리고 있어요...</p>
            </div>
          )}
          {!isSubmitted && <button onClick={submitAnswers} className="mt-4 w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">제출하기</button>}
          {isHost && timeLeft > 0 && <button onClick={startDiscussionPhase} className="mt-2 text-xs text-slate-400 font-bold underline">기다리기 지루한가요? 바로 발표 시작</button>}
        </div>
      )}

      {/* 4. Discussion Phase (Speaker Controlled) */}
      {isJoined && roomData?.status === 'discussion' && currentSpeaker && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto pb-20 relative">
          
          <div className={`text-center mb-4 p-3 rounded-2xl border-2 ${isMyTurn ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Speaker</p>
            <div className="flex items-center justify-center gap-2">
              <Megaphone size={20} className={isMyTurn ? "text-blue-500" : "text-slate-400"} />
              <h3 className={`text-xl font-black ${isMyTurn ? 'text-blue-600' : 'text-slate-700'}`}>
                {currentSpeaker.name}{isMyTurn && " (나)"}
              </h3>
            </div>
          </div>

          <div className="flex-1 bg-white border-2 border-slate-100 rounded-[2rem] p-4 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
            {roomData.currentActiveWord ? (
              <div className="w-full text-center space-y-6 animate-in zoom-in">
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">발표된 단어</p>
                  <h2 className="text-4xl font-black text-slate-800 break-keep">{roomData.currentActiveWord}</h2>
                </div>
                
                <div className="w-full border-t-2 border-dashed border-slate-100 my-4"></div>
                
                <div className="space-y-2 w-full">
                  <p className="text-xs font-bold text-blue-400 flex items-center justify-center gap-1"><Hand size={12}/> 공감한 사람들 ({roomData.submittedMatches?.length || 0})</p>
                  <div className="flex flex-wrap justify-center gap-2 max-h-40 overflow-y-auto">
                    {roomData.submittedMatches?.map((match, i) => (
                      <div key={i} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 border border-blue-100">
                        <span>{match.name}: {match.word}</span>
                        {isMyTurn && (
                          <button onClick={() => rejectMatch(match.uid)} className="text-red-400 hover:text-red-600">
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(!roomData.submittedMatches || roomData.submittedMatches.length === 0) && (
                      <p className="text-slate-300 text-xs font-bold">아직 제출한 사람이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <MessageCircle size={48} className="mx-auto mb-2 opacity-20"/>
                <p className="font-bold">{isMyTurn ? "단어를 하나 선택해서 발표하세요!" : "발표를 기다리는 중..."}</p>
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-slate-100 p-4 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10">
            <div className="max-w-lg mx-auto">
              <p className="text-xs font-bold text-slate-400 mb-3 ml-1">
                {isMyTurn ? "📢 내 단어 (발표할 것 선택)" : (roomData.currentActiveWord ? "✋ 공감되는 단어 제출하기" : "내 단어 목록")}
              </p>
              
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {myPlayer?.currentAnswers?.map((word, i) => {
                  const isUsed = myPlayer.scoredWords?.includes(word);
                  return (
                    <button 
                      key={i} 
                      disabled={isUsed || (!isMyTurn && !roomData.currentActiveWord)}
                      onClick={() => {
                        if (isMyTurn) announceWord(word);
                        else submitMatch(word);
                      }}
                      className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all 
                        ${isUsed 
                          ? 'bg-slate-100 border-slate-100 text-slate-300 line-through cursor-not-allowed' 
                          : (isMyTurn 
                              ? 'bg-yellow-50 border-yellow-400 text-slate-800 hover:bg-yellow-100' 
                              : (roomData.currentActiveWord ? 'bg-blue-50 border-blue-400 text-blue-700 hover:bg-blue-100' : 'bg-white border-slate-200 text-slate-500'))}
                      `}
                    >
                      {word}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2">
                {isMyTurn ? (
                  <button onClick={confirmScoreAndNext} disabled={!roomData.currentActiveWord} className="flex-1 bg-slate-800 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-lg shadow-lg transition-all">
                    <CheckCircle2 className="inline mr-2" size={18}/> 점수 인정 & 다음
                  </button>
                ) : (
                  <div className="flex-1 text-center text-slate-400 text-sm font-bold py-3 bg-slate-50 rounded-xl">발표자가 진행 중입니다...</div>
                )}
                {isHost && (
                  <button onClick={finishRound} className="bg-red-50 text-red-500 border-2 border-red-100 px-4 rounded-xl font-bold">라운드 종료</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Result Phase */}
      {isJoined && roomData?.status === 'result' && (
        <div className="p-4 max-w-lg mx-auto flex flex-col h-[calc(100vh-80px)]">
          <div className="text-center mb-6">
            <span className="text-xs font-bold text-slate-400 uppercase bg-white px-3 py-1 rounded-full border border-slate-200">Total Ranking</span>
            <h2 className="text-2xl font-black text-slate-800 mt-2">최종 결과</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pb-20 custom-scrollbar">
            <div className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm">
              <h4 className="text-sm font-black text-slate-400 mb-4 px-2 flex items-center gap-2"><Trophy size={16}/> 순위표</h4>
              {players.sort((a,b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3"><span className={`font-black w-6 text-center ${i===0?'text-yellow-500 text-2xl':'text-slate-300 text-lg'}`}>{i+1}</span><span className="font-bold text-slate-700">{p.name}</span></div>
                  <span className="font-black text-slate-800 text-lg">{p.score}점</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div className="fixed bottom-6 left-0 w-full px-6 flex justify-center">
              <button onClick={handleStartRound} className="w-full max-w-md bg-slate-900 text-white py-4 rounded-2xl font-black text-lg shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"><ArrowRight size={20} /> 다음 라운드</button>
            </div>
          )}
        </div>
      )}

    </div>
  );
    }
