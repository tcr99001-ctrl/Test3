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
  Megaphone, Hand, Gavel, XCircle, MessageCircle, Flame, Star,
  Gift, Sparkles, TrendingUp, Award, Target, Clock, ShieldCheck
} from 'lucide-react';

// ==================================================================
// Firebase 설정
// ==================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBPd5xk9UseJf79GTZogckQmKKwwogneco",
  authDomain: "test-4305d.firebaseapp.com",
  projectId: "test-4305d",
  storageBucket: "test-4305d.firebasestorage.app",
  messagingSenderId: "402376205992",
  appId: "1:402376205992:web:be662592fa4d5f0efb849d"
};

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

// ==================================================================
// 게임 상수 및 설정
// ==================================================================
const TOPICS = [
  "편의점", "겨울 간식", "빨간색 물건", "라면에 넣는 것", "영화관", 
  "놀이공원", "해외여행지", "치킨 브랜드", "한국의 도시", "초능력",
  "무인도에 가져갈 것", "잠 안 올 때 하는 일", "비 오는 날", "결혼식", "크리스마스",
  "학창시절", "다이어트", "여름 방학", "공포영화 클리셰", "삼겹살 짝꿍",
  "편의점 꿀조합", "카페 메뉴", "취미 생활", "마트에서 사는 것", "운동",
  "동물원", "캠핑 용품", "소확행", "아르바이트", "찜질방",
  "아침 식사", "야식", "데이트 장소", "스트레스 해소법", "주말",
  "생일 선물", "여름", "가을", "봄", "겨울왕국"
];

const ROUND_TIME = 60;
const COMBO_THRESHOLD = 3; // 콤보 발동 기준
const ACHIEVEMENTS = [
  { id: 'telepathy', name: '텔레파시 마스터', desc: '한 라운드에서 5개 이상 맞추기', icon: '🧠' },
  { id: 'speed', name: '스피드 킹', desc: '10초 안에 제출하기', icon: '⚡' },
  { id: 'combo', name: '콤보 마스터', desc: '5콤보 달성', icon: '🔥' },
  { id: 'perfect', name: '완벽주의자', desc: '모든 단어 점수화', icon: '💯' },
];

const RANDOM_EVENTS = [
  { id: 'double', name: '더블 찬스!', desc: '이번 라운드 점수 2배!', icon: '✨', effect: 'double' },
  { id: 'extra', name: '보너스 타임!', desc: '+30초 추가!', icon: '⏰', effect: 'time' },
  { id: 'golden', name: '황금 라운드!', desc: '모든 매칭 +5점!', icon: '👑', effect: 'golden' },
];

const vibrate = () => { 
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30); 
};

const vibrateSuccess = () => { 
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 30, 50]); 
};

// ==================================================================
// 메인 컴포넌트
// ==================================================================
export default function EnhancedNeodoNado() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myAnswers, setMyAnswers] = useState(['', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(initError);
  const [copyStatus, setCopyStatus] = useState(null);
  
  // 새로운 상태들
  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [powerUps, setPowerUps] = useState({ hint: false, timeBoost: false, doubleScore: false });
  const [startTime, setStartTime] = useState(null);
  const [theme, setTheme] = useState('default');
  const [showEventPopup, setShowEventPopup] = useState(null);

  const isJoined = user && players.some(p => p.id === user.uid);
  const isHost = roomData?.hostId === user?.uid;
  const currentSpeaker = players[roomData?.currentSpeakerIndex];
  const isMyTurn = currentSpeaker?.id === user?.uid;
  const myPlayer = players.find(p => p.id === user?.uid);
  const isSubmitted = myPlayer?.currentAnswers;

  // ==================================================================
  // Auth & 실시간 동기화
  // ==================================================================
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
        
        // 랜덤 이벤트 팝업 표시
        if (data.currentEvent && !showEventPopup) {
          const event = RANDOM_EVENTS.find(e => e.id === data.currentEvent);
          if (event) {
            setShowEventPopup(event);
            setTimeout(() => setShowEventPopup(null), 3000);
          }
        }
        
        if (data.status === 'playing' && data.endTime) {
          const diff = Math.ceil((data.endTime - Date.now()) / 1000);
          setTimeLeft(diff > 0 ? diff : 0);
        }
      } else setRoomData(null);
    });

    const unsubPlayers = onSnapshot(collection(db,'rooms',roomCode,'players'), s => {
      const list=[]; 
      s.forEach(d=>list.push({id:d.id, ...d.data()}));
      setPlayers(list);
    });
    
    return () => { unsubRoom(); unsubPlayers(); };
  }, [user, roomCode]);

  // ==================================================================
  // 타이머
  // ==================================================================
  useEffect(() => {
    if (roomData?.status === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(timer);
    }
    if (roomData?.status === 'playing' && timeLeft === 0 && isHost && !isSubmitted) {
      // 타이머 종료 시 자동 전환 (한 번만 실행)
      startDiscussionPhase();
    }
  }, [roomData?.status, timeLeft, isHost]);

  // ==================================================================
  // Presence (하트비트)
  // ==================================================================
  useEffect(() => {
    if(!isJoined || !roomCode || !user) return;
    const hb = async () => { 
      try { 
        await updateDoc(doc(db,'rooms',roomCode,'players',user.uid), { 
          lastActive: Date.now() 
        }); 
      } catch(e){} 
    };
    hb();
    const t = setInterval(hb, 5000);
    return () => clearInterval(t);
  }, [isJoined, roomCode, user]);

  useEffect(() => {
    if(!isHost || !players.length) return;
    const cl = setInterval(() => {
      const now = Date.now();
      players.forEach(async p => {
        if(p.lastActive && now - p.lastActive > 20000) {
          try { 
            await deleteDoc(doc(db,'rooms',roomCode,'players',p.id)); 
          } catch(e){}
        }
      });
    }, 10000);
    return () => clearInterval(cl);
  }, [isHost, players, roomCode]);

  // ==================================================================
  // 콤보 애니메이션
  // ==================================================================
  useEffect(() => {
    if (combo >= COMBO_THRESHOLD) {
      setShowCombo(true);
      vibrateSuccess();
      setTimeout(() => setShowCombo(false), 2000);
    }
  }, [combo]);

  // ==================================================================
  // 게임 액션들
  // ==================================================================
  const handleCreate = async () => {
    if(!playerName.trim()) return setError("이름을 입력하세요");
    vibrate();
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, 
      status: 'lobby', 
      round: 0,
      topic: '', 
      endTime: 0, 
      currentSpeakerIndex: 0, 
      currentActiveWord: null, 
      submittedMatches: [], 
      currentEvent: null,
      mvp: null,
      createdAt: Date.now()
    });
    await setDoc(doc(db,'rooms',code,'players',user.uid), { 
      name: playerName.trim(), 
      score: 0, 
      combo: 0,
      achievements: [],
      joinedAt: Date.now(), 
      lastActive: Date.now() 
    });
    setRoomCode(code);
  };

  const handleJoin = async () => {
    if(!playerName.trim() || roomCode.length!==4) return setError("정보를 확인하세요");
    vibrate();
    const snap = await getDoc(doc(db,'rooms',roomCode));
    if(!snap.exists()) return setError("방이 없습니다");
    await setDoc(doc(db,'rooms',roomCode,'players',user.uid), { 
      name: playerName.trim(), 
      score: 0, 
      combo: 0,
      achievements: [],
      joinedAt: Date.now(), 
      lastActive: Date.now() 
    });
  };

  const handleStartRound = async () => {
    vibrate();
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const baseTime = ROUND_TIME;
    
    // 랜덤 이벤트 발생 (30% 확률)
    let randomEvent = null;
    let timeBonus = 0;
    if (Math.random() < 0.3) {
      const eventOptions = ['double', 'time', 'golden'];
      randomEvent = eventOptions[Math.floor(Math.random() * eventOptions.length)];
      if (randomEvent === 'time') timeBonus = 30;
    }
    
    const endTime = Date.now() + ((baseTime + timeBonus) * 1000);
    
    // 모든 플레이어 답변 초기화
    const resetUpdates = players.map(p => 
      updateDoc(doc(db,'rooms',roomCode,'players',p.id), { 
        currentAnswers: null, 
        scoredWords: [],
        roundScore: 0,
        roundMatches: 0
      })
    );
    await Promise.all(resetUpdates);

    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'playing', 
      topic, 
      endTime, 
      round: (roomData.round || 0) + 1,
      currentSpeakerIndex: 0,
      currentActiveWord: null,
      submittedMatches: [],
      currentEvent: randomEvent,
      mvp: null
    });
    
    setMyAnswers(['','','','','']);
    setStartTime(Date.now());
    setCombo(0);
  };

  const submitAnswers = async () => {
    vibrate();
    const validAnswers = myAnswers.map(a => a.trim()).filter(a => a !== "");
    
    if (validAnswers.length === 0) {
      setError("최소 1개 이상의 답변을 입력하세요!");
      return;
    }
    
    // 스피드 업적 체크 (10초 이내 제출)
    const submitTime = Date.now();
    const timeTaken = (submitTime - startTime) / 1000;
    let newAchievements = [...(myPlayer?.achievements || [])];
    
    if (timeTaken <= 10 && !newAchievements.includes('speed')) {
      newAchievements.push('speed');
      setAchievements([...achievements, ACHIEVEMENTS.find(a => a.id === 'speed')]);
    }
    
    await updateDoc(doc(db,'rooms',roomCode,'players',user.uid), {
      currentAnswers: validAnswers,
      achievements: newAchievements
    });
    
    vibrateSuccess();
  };

  const startDiscussionPhase = async () => {
    if(!isHost) return;
    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'discussion',
      currentSpeakerIndex: 0,
      currentActiveWord: null,
      submittedMatches: []
    });
  };

  const announceWord = async (word) => {
    if (!isMyTurn) return;
    vibrate();
    await updateDoc(doc(db, 'rooms', roomCode), {
      currentActiveWord: word,
      submittedMatches: [] 
    });
  };

  const submitMatch = async (word) => {
    vibrate();
    
    // 중복 제출 방지 (개선된 로직)
    const alreadySubmitted = roomData.submittedMatches?.some(m => m.uid === user.uid);
    if(alreadySubmitted) {
      setError("이미 단어를 제출했습니다!");
      return;
    }
    
    // 자기 자신과 매칭하려는 경우 방지
    if (user.uid === currentSpeaker?.id) {
      setError("발표자는 자신의 단어에 공감할 수 없습니다!");
      return;
    }

    const newMatches = [
      ...(roomData.submittedMatches || []), 
      { 
        uid: user.uid, 
        name: myPlayer?.name || '익명', // 버그 수정: playerName -> myPlayer.name
        word: word 
      }
    ];
    
    await updateDoc(doc(db, 'rooms', roomCode), {
      submittedMatches: newMatches
    });
    
    // 콤보 증가
    const newCombo = combo + 1;
    setCombo(newCombo);
    
    vibrateSuccess();
  };

  const rejectMatch = async (targetUid) => {
    if(!isMyTurn) return;
    vibrate();
    const newMatches = roomData.submittedMatches.filter(m => m.uid !== targetUid);
    await updateDoc(doc(db, 'rooms', roomCode), {
      submittedMatches: newMatches
    });
  };

  const confirmScoreAndNext = async () => {
    if(!isMyTurn || !roomData.currentActiveWord) return;
    vibrate();

    const matchCount = roomData.submittedMatches?.length || 0;
    let baseScore = 1 + matchCount;
    
    // 이벤트 효과 적용
    if (roomData.currentEvent === 'double') {
      baseScore *= 2;
    } else if (roomData.currentEvent === 'golden') {
      baseScore += 5;
    }
    
    const speaker = players[roomData.currentSpeakerIndex];
    if (speaker) {
      const newScored = [...(speaker.scoredWords || []), roomData.currentActiveWord];
      const newRoundScore = (speaker.roundScore || 0) + baseScore;
      const newRoundMatches = (speaker.roundMatches || 0) + matchCount;
      
      await updateDoc(doc(db, 'rooms', roomCode, 'players', speaker.id), {
        score: (speaker.score || 0) + baseScore,
        scoredWords: newScored,
        roundScore: newRoundScore,
        roundMatches: newRoundMatches
      });
    }

    // 매칭된 플레이어들에게 점수 부여
    const matchUpdates = (roomData.submittedMatches || []).map(match => {
      const p = players.find(player => player.id === match.uid);
      if(p) {
        const newScored = [...(p.scoredWords || []), match.word];
        const newRoundScore = (p.roundScore || 0) + baseScore;
        const newRoundMatches = (p.roundMatches || 0) + 1;
        
        return updateDoc(doc(db, 'rooms', roomCode, 'players', p.id), {
          score: (p.score || 0) + baseScore,
          scoredWords: newScored,
          roundScore: newRoundScore,
          roundMatches: newRoundMatches
        });
      }
      return Promise.resolve();
    });
    await Promise.all(matchUpdates);

    // 다음 턴
    let nextIndex = (roomData.currentSpeakerIndex + 1) % players.length;
    
    await updateDoc(doc(db, 'rooms', roomCode), {
      currentActiveWord: null,
      submittedMatches: [],
      currentSpeakerIndex: nextIndex
    });
  };

  const finishRound = async () => {
    if(!isHost) return;
    if(!window.confirm("모든 단어 확인이 끝났나요? 결과를 보러 갑니다.")) return;
    
    // MVP 계산 (가장 많은 매칭을 만든 사람)
    let mvpPlayer = null;
    let maxMatches = 0;
    
    players.forEach(p => {
      const matches = p.roundMatches || 0;
      if (matches > maxMatches) {
        maxMatches = matches;
        mvpPlayer = p;
      }
    });
    
    await updateDoc(doc(db, 'rooms', roomCode), { 
      status: 'result',
      mvp: mvpPlayer ? { name: mvpPlayer.name, matches: maxMatches } : null
    });
  };

  const sendReaction = async (emoji) => {
    vibrate();
    const newReaction = { 
      id: Date.now(), 
      emoji, 
      name: myPlayer?.name || '익명',
      x: Math.random() * 80 + 10,
      y: Math.random() * 50 + 25
    };
    
    setReactions(prev => [...prev, newReaction]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 2000);
  };

  // ==================================================================
  // UI 헬퍼
  // ==================================================================
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

  const getThemeColors = () => {
    switch(theme) {
      case 'dark': return { bg: 'bg-slate-900', text: 'text-white', accent: 'bg-purple-500' };
      case 'ocean': return { bg: 'bg-blue-50', text: 'text-blue-900', accent: 'bg-blue-400' };
      case 'forest': return { bg: 'bg-green-50', text: 'text-green-900', accent: 'bg-green-400' };
      default: return { bg: 'bg-yellow-50', text: 'text-slate-800', accent: 'bg-yellow-400' };
    }
  };

  const colors = getThemeColors();

  // ==================================================================
  // 렌더링
  // ==================================================================
  if(!user) return (
    <div className="h-screen flex items-center justify-center bg-yellow-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-yellow-400 mx-auto mb-4"></div>
        <p className="font-bold text-yellow-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${colors.bg} ${colors.text} font-sans relative overflow-x-hidden selection:bg-yellow-200 transition-colors duration-300`}>
      
      {/* 헤더 */}
      <header className="bg-white border-b-4 border-yellow-400 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className={`p-2 ${colors.accent} rounded-xl text-white shadow-[2px_2px_0px_rgba(0,0,0,0.1)]`}>
            <Zap size={24} fill="currentColor"/>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">너도나도</h1>
            <p className="text-[10px] text-slate-400 font-bold">ULTRA EDITION</p>
          </div>
        </div>
        {isJoined && roomCode && (
          <div className="flex items-center gap-2">
            <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-lg font-black">{roomCode}</div>
            {roomData?.round > 0 && (
              <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold">
                R{roomData.round}
              </div>
            )}
          </div>
        )}
      </header>

      {/* 에러 표시 */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-100 border-2 border-red-200 rounded-2xl flex items-center gap-3 text-red-600 font-bold animate-in slide-in-from-top">
          <AlertCircle size={20} /> 
          <span className="text-sm flex-1">{error}</span> 
          <button onClick={()=>setError(null)} className="hover:scale-110 transition-transform">✕</button>
        </div>
      )}

      {/* 랜덤 이벤트 팝업 */}
      {showEventPopup && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in zoom-in slide-in-from-top">
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-4 rounded-2xl shadow-2xl border-4 border-white">
            <div className="text-center">
              <div className="text-4xl mb-2">{showEventPopup.icon}</div>
              <h3 className="font-black text-xl mb-1">{showEventPopup.name}</h3>
              <p className="text-sm font-bold opacity-90">{showEventPopup.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* 콤보 표시 */}
      {showCombo && combo >= COMBO_THRESHOLD && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-in zoom-in">
          <div className="text-center">
            <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse">
              {combo}
            </div>
            <div className="text-2xl font-black text-orange-500 flex items-center justify-center gap-2">
              <Flame className="animate-bounce" /> COMBO! <Flame className="animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {/* 리액션 애니메이션 */}
      {reactions.map(reaction => (
        <div 
          key={reaction.id}
          className="fixed z-40 pointer-events-none animate-in fade-in zoom-in"
          style={{ 
            left: `${reaction.x}%`, 
            top: `${reaction.y}%`,
            animation: 'float-up 2s ease-out forwards'
          }}
        >
          <div className="text-4xl">{reaction.emoji}</div>
        </div>
      ))}

      {/* 1. 입장 화면 */}
      {!isJoined && (
        <div className="p-6 max-w-md mx-auto mt-10 animate-in fade-in zoom-in-95">
          <div className="bg-white p-8 rounded-[2rem] shadow-[8px_8px_0px_rgba(0,0,0,0.1)] border-4 border-slate-100 space-y-6">
            <div className="text-center">
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-3xl font-black text-slate-800 mb-1">공감 게임</h2>
              <p className="text-slate-400 text-sm font-bold">텔레파시가 통하는 친구는?</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-bold">✨ 콤보 시스템</span>
                <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-bold">🎁 랜덤 이벤트</span>
                <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full font-bold">🏆 업적 시스템</span>
              </div>
            </div>
            
            <input 
              value={playerName} 
              onChange={e=>setPlayerName(e.target.value)} 
              placeholder="닉네임 입력" 
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-5 py-4 text-lg font-bold outline-none focus:border-yellow-400 transition-all"
              maxLength={12}
            />
            
            {!roomCode && (
              <button 
                onClick={handleCreate} 
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-white py-4 rounded-xl font-black text-xl shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] transition-all"
              >
                🎮 방 만들기
              </button>
            )}
            
            <div className="flex gap-3">
              <input 
                value={roomCode} 
                onChange={e=>setRoomCode(e.target.value.toUpperCase())} 
                placeholder="코드" 
                maxLength={4} 
                className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl text-center font-mono font-black text-xl outline-none focus:border-yellow-400 uppercase"
              />
              <button 
                onClick={handleJoin} 
                className="flex-[1.5] bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold shadow-[4px_4px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.2)] transition-all"
              >
                입장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 대기실 */}
      {isJoined && roomData?.status === 'lobby' && (
        <div className="p-6 max-w-md mx-auto space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-white p-6 rounded-[2rem] border-4 border-blue-100 shadow-xl flex justify-between items-center">
            <div>
              <p className="text-blue-400 text-xs font-black uppercase tracking-widest">Players</p>
              <h2 className="text-4xl font-black text-slate-800">
                {players.length} <span className="text-xl text-slate-300">/ 20</span>
              </h2>
            </div>
            <Users size={40} className="text-blue-200"/>
          </div>
          
          <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-4 min-h-[300px] flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-400 uppercase">대기 명단</span>
              <button 
                onClick={copyInviteLink} 
                className="text-[10px] font-bold text-white bg-slate-800 px-3 py-1.5 rounded-full flex gap-1 hover:bg-slate-700 transition-colors"
              >
                {copyStatus==='link'?<CheckCircle2 size={12}/>:<LinkIcon size={12}/>} 
                초대 링크
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {players.map(p => (
                <div 
                  key={p.id} 
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${p.id===user.uid?'bg-blue-500':'bg-slate-300'}`}></div>
                    <span className={`font-bold ${p.id===user.uid ? 'text-blue-600' : 'text-slate-600'}`}>
                      {p.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{p.score}점</span>
                    {p.id===roomData.hostId && <Crown size={16} className="text-yellow-500" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {isHost ? (
            <button 
              onClick={handleStartRound} 
              className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white p-5 rounded-2xl font-black text-xl shadow-[0_8px_20px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Play size={24} fill="currentColor"/> 게임 시작
            </button>
          ) : (
            <div className="text-center">
              <div className="animate-pulse py-4 text-slate-400 font-bold">
                방장이 곧 시작합니다...
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. 입력 단계 */}
      {isJoined && roomData?.status === 'playing' && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto pb-20">
          
          {/* 주제 카드 */}
          <div className="bg-white border-2 border-yellow-400 p-6 rounded-3xl shadow-[4px_4px_0px_#facc15] text-center mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
              <div 
                className="h-full bg-yellow-400 transition-all duration-1000" 
                style={{width: `${(timeLeft/ROUND_TIME)*100}%`}}
              ></div>
            </div>
            
            <p className="text-yellow-500 text-xs font-black uppercase tracking-widest mb-1">주제어</p>
            <h2 className="text-3xl font-black text-slate-800 break-keep leading-tight">{roomData.topic}</h2>
            
            <div className="absolute top-4 right-4 flex items-center gap-1 text-slate-400 font-mono font-bold">
              <Timer size={16}/> {timeLeft}
            </div>
            
            {roomData.currentEvent && (
              <div className="mt-3 inline-flex items-center gap-2 bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-xs font-bold">
                <Sparkles size={12} />
                {RANDOM_EVENTS.find(e => e.id === roomData.currentEvent)?.name}
              </div>
            )}
          </div>

          {!isSubmitted ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto pb-4">
                <p className="text-center text-slate-400 text-xs font-bold mb-2">
                  떠오르는 단어 5개를 적으세요!
                </p>
                {myAnswers.map((ans, idx) => (
                  <div key={idx} className="flex items-center gap-3 animate-in slide-in-from-left" style={{animationDelay: `${idx * 50}ms`}}>
                    <span className="w-6 text-center font-black text-slate-300">{idx+1}</span>
                    <input 
                      value={ans} 
                      onChange={e => handleInputChange(idx, e.target.value)} 
                      className="flex-1 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none transition-all shadow-sm hover:shadow-md" 
                      placeholder="..."
                      maxLength={20}
                    />
                  </div>
                ))}
              </div>
              
              <button 
                onClick={submitAnswers} 
                className="mt-4 w-full bg-gradient-to-r from-slate-800 to-slate-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all hover:shadow-xl"
              >
                ✅ 제출하기
              </button>
              
              {isHost && timeLeft > 0 && (
                <button 
                  onClick={startDiscussionPhase} 
                  className="mt-2 text-xs text-slate-400 font-bold underline hover:text-slate-600 transition-colors"
                >
                  기다리기 지루한가요? 바로 발표 시작
                </button>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-500 animate-bounce">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-xl font-black text-slate-700">제출 완료!</h3>
              <p className="text-slate-400 text-sm font-bold">다른 친구들을 기다리고 있어요...</p>
              
              {/* 제출된 플레이어 수 */}
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold">
                  <Users size={16} />
                  {players.filter(p => p.currentAnswers).length} / {players.length} 명 제출
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. 발표 단계 */}
      {isJoined && roomData?.status === 'discussion' && currentSpeaker && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto pb-20 relative">
          
          {/* 발표자 표시 */}
          <div className={`text-center mb-4 p-3 rounded-2xl border-2 ${isMyTurn ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Speaker</p>
            <div className="flex items-center justify-center gap-2">
              <Megaphone size={20} className={isMyTurn ? "text-blue-500" : "text-slate-400"} />
              <h3 className={`text-xl font-black ${isMyTurn ? 'text-blue-600' : 'text-slate-700'}`}>
                {currentSpeaker.name}{isMyTurn && " (나)"}
              </h3>
            </div>
          </div>

          {/* 발표 영역 */}
          <div className="flex-1 bg-white border-2 border-slate-100 rounded-[2rem] p-4 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
            {roomData.currentActiveWord ? (
              <div className="w-full text-center space-y-6 animate-in zoom-in">
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">발표된 단어</p>
                  <h2 className="text-4xl font-black text-slate-800 break-keep">{roomData.currentActiveWord}</h2>
                </div>
                
                <div className="w-full border-t-2 border-dashed border-slate-100 my-4"></div>
                
                <div className="space-y-2 w-full">
                  <p className="text-xs font-bold text-blue-400 flex items-center justify-center gap-1">
                    <Hand size={12}/> 공감한 사람들 ({roomData.submittedMatches?.length || 0})
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-h-40 overflow-y-auto">
                    {roomData.submittedMatches?.map((match, i) => (
                      <div 
                        key={i} 
                        className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-sm font-bold flex items-center gap-2 border border-blue-100 animate-in slide-in-from-bottom"
                      >
                        <span>{match.name}: {match.word}</span>
                        {isMyTurn && (
                          <button 
                            onClick={() => rejectMatch(match.uid)} 
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
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

                {/* 리액션 버튼 */}
                <div className="flex justify-center gap-2 pt-4">
                  {['👏', '🔥', '😂', '💯'].map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="w-10 h-10 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-xl transition-all hover:scale-110 active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <MessageCircle size={48} className="mx-auto mb-2 opacity-20"/>
                <p className="font-bold">
                  {isMyTurn ? "단어를 하나 선택해서 발표하세요!" : "발표를 기다리는 중..."}
                </p>
              </div>
            )}
          </div>

          {/* 하단 액션 바 */}
          <div className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-slate-100 p-4 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10">
            <div className="max-w-lg mx-auto">
              <p className="text-xs font-bold text-slate-400 mb-3 ml-1">
                {isMyTurn 
                  ? "📢 내 단어 (발표할 것 선택)" 
                  : (roomData.currentActiveWord ? "✋ 공감되는 단어 제출하기" : "내 단어 목록")}
              </p>
              
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {myPlayer?.currentAnswers?.map((word, i) => {
                  const isUsed = myPlayer.scoredWords?.includes(word);
                  const canClick = !isUsed && (isMyTurn || roomData.currentActiveWord);
                  
                  return (
                    <button 
                      key={i} 
                      disabled={!canClick}
                      onClick={() => {
                        if (isMyTurn) announceWord(word);
                        else submitMatch(word);
                      }}
                      className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all 
                        ${isUsed 
                          ? 'bg-slate-100 border-slate-100 text-slate-300 line-through cursor-not-allowed' 
                          : (isMyTurn 
                              ? 'bg-yellow-50 border-yellow-400 text-slate-800 hover:bg-yellow-100 hover:scale-105' 
                              : (roomData.currentActiveWord 
                                  ? 'bg-blue-50 border-blue-400 text-blue-700 hover:bg-blue-100 hover:scale-105' 
                                  : 'bg-white border-slate-200 text-slate-500'))}
                      `}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                {isMyTurn ? (
                  <button 
                    onClick={confirmScoreAndNext} 
                    disabled={!roomData.currentActiveWord} 
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 disabled:from-slate-300 disabled:to-slate-300 text-white py-3 rounded-xl font-black text-lg shadow-lg transition-all hover:shadow-xl active:scale-95 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="inline mr-2" size={18}/> 점수 인정 & 다음
                  </button>
                ) : (
                  <div className="flex-1 text-center text-slate-400 text-sm font-bold py-3 bg-slate-50 rounded-xl">
                    발표자가 진행 중입니다...
                  </div>
                )}
                
                {isHost && (
                  <button 
                    onClick={finishRound} 
                    className="bg-red-50 text-red-500 border-2 border-red-100 px-4 rounded-xl font-bold hover:bg-red-100 transition-colors"
                  >
                    라운드 종료
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 결과 화면 */}
      {isJoined && roomData?.status === 'result' && (
        <div className="p-4 max-w-lg mx-auto flex flex-col h-[calc(100vh-80px)]">
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">🏆</div>
            <span className="text-xs font-bold text-slate-400 uppercase bg-white px-3 py-1 rounded-full border border-slate-200">
              Round {roomData.round} Result
            </span>
            <h2 className="text-2xl font-black text-slate-800 mt-2">최종 결과</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pb-20 custom-scrollbar">
            
            {/* MVP 표시 */}
            {roomData.mvp && (
              <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-4 rounded-[2rem] shadow-lg text-white animate-in zoom-in">
                <div className="text-center">
                  <div className="text-3xl mb-2">👑</div>
                  <p className="text-xs font-bold opacity-90 uppercase tracking-wider">Round MVP</p>
                  <h3 className="text-2xl font-black">{roomData.mvp.name}</h3>
                  <p className="text-sm font-bold opacity-90 mt-1">
                    {roomData.mvp.matches}개 매칭 성공!
                  </p>
                </div>
              </div>
            )}

            {/* 순위표 */}
            <div className="bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm">
              <h4 className="text-sm font-black text-slate-400 mb-4 px-2 flex items-center gap-2">
                <Trophy size={16}/> 순위표
              </h4>
              {players.sort((a,b) => b.score - a.score).map((p, i) => (
                <div 
                  key={p.id} 
                  className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-black w-6 text-center ${
                      i===0 ? 'text-yellow-500 text-2xl' : 
                      i===1 ? 'text-slate-400 text-xl' :
                      i===2 ? 'text-orange-400 text-xl' :
                      'text-slate-300 text-lg'
                    }`}>
                      {i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : i+1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-700">{p.name}</span>
                      {p.roundMatches > 0 && (
                        <div className="text-xs text-blue-500 font-bold">
                          +{p.roundScore || 0}점 (이번 라운드)
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-black text-slate-800 text-lg">{p.score}점</span>
                </div>
              ))}
            </div>

            {/* 업적 표시 (내 업적만) */}
            {myPlayer?.achievements && myPlayer.achievements.length > 0 && (
              <div className="bg-purple-50 border-2 border-purple-200 p-4 rounded-2xl">
                <h4 className="text-sm font-black text-purple-600 mb-3 flex items-center gap-2">
                  <Award size={16}/> 내 업적
                </h4>
                <div className="flex flex-wrap gap-2">
                  {myPlayer.achievements.map(achId => {
                    const ach = ACHIEVEMENTS.find(a => a.id === achId);
                    return ach ? (
                      <div key={achId} className="bg-white px-3 py-2 rounded-xl text-xs font-bold text-purple-600 border border-purple-100">
                        {ach.icon} {ach.name}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {isHost && (
            <div className="fixed bottom-6 left-0 w-full px-6 flex justify-center gap-3">
              <button 
                onClick={handleStartRound} 
                className="flex-1 max-w-md bg-gradient-to-r from-slate-900 to-slate-700 text-white py-4 rounded-2xl font-black text-lg shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all hover:shadow-3xl"
              >
                <ArrowRight size={20} /> 다음 라운드
              </button>
            </div>
          )}
        </div>
      )}

      {/* CSS 애니메이션 */}
      <style jsx>{`
        @keyframes float-up {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-100px) scale(1.5);
          }
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        @keyframes animate-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation: animate-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
