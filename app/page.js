'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Play, Users, Crown, Copy, CheckCircle2, Link as LinkIcon, 
  Smile, Zap, Trophy, Timer, ArrowRight, RefreshCw, AlertCircle 
} from 'lucide-react';

// ==================================================================
// [완료] 기존에 사용하시던 Firebase 설정값을 적용했습니다.
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
  console.error("Firebase Init Error:", e);
  initError = e.message;
}

// --- 게임 데이터 (주제어 30개) ---
const TOPICS = [
  "편의점", "겨울 간식", "빨간색 물건", "라면에 넣는 것", "영화관", 
  "놀이공원", "해외여행지", "치킨 브랜드", "한국의 도시", "초능력",
  "무인도에 가져갈 것", "잠 안 올 때 하는 일", "비 오는 날", "결혼식", "크리스마스",
  "학창시절", "다이어트", "여름 방학", "공포영화 클리셰", "삼겹살 짝꿍",
  "편의점 꿀조합", "카페 메뉴", "취미 생활", "마트에서 사는 것", "운동",
  "동물원", "캠핑 용품", "소확행", "아르바이트", "찜질방"
];

const ROUND_TIME = 60; // 60초

const vibrate = () => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30); };

export default function NeodoNadoGame() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myAnswers, setMyAnswers] = useState(['', '', '', '', '']); // 5개 입력
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(initError);
  const [copyStatus, setCopyStatus] = useState(null);

  const isJoined = user && players.some(p => p.id === user.uid);
  const isHost = roomData?.hostId === user?.uid;

  // --- Auth & Initial URL Check ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('room');
      if (code && code.length === 4) setRoomCode(code.toUpperCase());
    }
    
    if(!auth) {
      if(!initError) setError("Firebase 인증 객체가 없습니다. 설정을 확인하세요.");
      return;
    }

    const unsub = onAuthStateChanged(auth, u => {
      if(u) setUser(u);
      else signInAnonymously(auth).catch(e => setError("로그인 실패: "+e.message));
    });
    return () => unsub();
  }, []);

  // --- Data Sync ---
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

  // --- Timer & Auto Finish ---
  useEffect(() => {
    if (roomData?.status === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
      return () => clearInterval(timer);
    }
    if (roomData?.status === 'playing' && timeLeft === 0 && isHost) {
      // 시간 종료 시 자동 채점 단계로 이동
      calculateScores();
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

  // --- Game Actions ---
  const handleCreate = async () => {
    if(!playerName) return setError("이름을 입력하세요");
    vibrate();
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, status: 'lobby', round: 0,
      topic: '', endTime: 0,
      allAnswers: {}, // 라운드별 답변 모음
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
    
    // 플레이어들의 현재 라운드 답변 초기화
    const resetUpdates = players.map(p => updateDoc(doc(db,'rooms',roomCode,'players',p.id), { currentAnswers: null }));
    await Promise.all(resetUpdates);

    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'playing', topic, endTime, 
      round: (roomData.round || 0) + 1
    });
    setMyAnswers(['','','','','']); // 클라이언트 입력 초기화
  };

  const submitAnswers = async () => {
    vibrate();
    // 빈칸 제외하고 저장
    const validAnswers = myAnswers.map(a => a.trim()).filter(a => a !== "");
    await updateDoc(doc(db,'rooms',roomCode,'players',user.uid), {
      currentAnswers: validAnswers
    });
  };

  // --- Scoring Logic (Host Only) ---
  const calculateScores = async () => {
    if(!isHost) return;
    
    // 1. 모든 플레이어의 답변 수집
    const allPlayerAnswers = players.map(p => ({
      id: p.id,
      name: p.name,
      answers: p.currentAnswers || []
    }));

    // 2. 단어 빈도수 계산
    const frequency = {};
    allPlayerAnswers.forEach(p => {
      p.answers.forEach(word => {
        const cleanWord = word.trim(); // 공백 제거
        if(cleanWord) frequency[cleanWord] = (frequency[cleanWord] || 0) + 1;
      });
    });

    // 3. 점수 계산 및 DB 업데이트
    const updates = allPlayerAnswers.map(p => {
      let roundScore = 0;
      const scoredWords = []; // 점수 얻은 단어 목록

      p.answers.forEach(word => {
        const cleanWord = word.trim();
        const count = frequency[cleanWord] || 0;
        if (count > 1) { // 나 말고 또 쓴 사람이 있어야 점수 (나 포함 count점이므로 count > 1)
          roundScore += count;
          scoredWords.push({ word: cleanWord, point: count });
        } else {
          scoredWords.push({ word: cleanWord, point: 0 }); // 혼자 쓴 건 0점
        }
      });

      // 기존 총점에 누적
      const currentTotal = players.find(player => player.id === p.id)?.score || 0;
      
      return updateDoc(doc(db,'rooms',roomCode,'players',p.id), {
        score: currentTotal + roundScore,
        lastRoundResult: { score: roundScore, details: scoredWords }
      });
    });

    await Promise.all(updates);
    await updateDoc(doc(db,'rooms',roomCode), { status: 'result', frequency });
  };

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

  // --- Render Helpers ---
  const myPlayer = players.find(p => p.id === user?.uid);
  const isSubmitted = myPlayer?.currentAnswers;

  if (error) return (
    <div className="flex h-screen flex-col items-center justify-center bg-yellow-50 text-red-500 font-bold p-6 text-center">
      <AlertCircle size={40} className="mb-4"/>
      <p>{error}</p>
      <button onClick={()=>window.location.reload()} className="mt-4 bg-slate-200 px-4 py-2 rounded text-black">새로고침</button>
    </div>
  );

  if(!user) return <div className="h-screen flex items-center justify-center bg-yellow-50 font-bold text-yellow-600">Loading...</div>;

  return (
    <div className="min-h-screen bg-yellow-50 text-slate-800 font-sans relative overflow-x-hidden selection:bg-yellow-200">
      
      {/* Header */}
      <header className="bg-white border-b-4 border-yellow-400 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-yellow-400 rounded-xl text-white shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
            <Zap size={24} fill="currentColor"/>
          </div>
          <div><h1 className="text-xl font-black tracking-tight text-slate-800">너도나도</h1></div>
        </div>
        {isJoined && roomCode && <div className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-lg font-black">{roomCode}</div>}
      </header>

      {/* --- SCENE 1: ENTRANCE --- */}
      {!isJoined && (
        <div className="p-6 max-w-md mx-auto mt-10 animate-in fade-in zoom-in-95">
          <div className="bg-white p-8 rounded-[2rem] shadow-[8px_8px_0px_rgba(0,0,0,0.1)] border-4 border-slate-100 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-black text-slate-800 mb-1">공감 게임</h2>
              <p className="text-slate-400 text-sm font-bold">텔레파시가 통하는 친구는?</p>
            </div>
            
            <input 
              value={playerName} onChange={e=>setPlayerName(e.target.value)} 
              placeholder="닉네임" 
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-5 py-4 text-lg font-bold outline-none focus:border-yellow-400 transition-all"
            />
            
            {!roomCode && (
              <button onClick={handleCreate} className="w-full bg-yellow-400 hover:bg-yellow-500 text-white py-4 rounded-xl font-black text-xl shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] transition-all">
                방 만들기
              </button>
            )}

            <div className="flex gap-3">
              <input 
                value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} 
                placeholder="코드" maxLength={4}
                className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl text-center font-mono font-black text-xl outline-none focus:border-yellow-400"
              />
              <button onClick={handleJoin} className="flex-[1.5] bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold shadow-[4px_4px_0px_rgba(0,0,0,0.2)] active:translate-y-[2px] active:shadow-[2px_2px_0px_rgba(0,0,0,0.2)] transition-all">
                입장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SCENE 2: LOBBY --- */}
      {isJoined && roomData?.status === 'lobby' && (
        <div className="p-6 max-w-md mx-auto space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-white p-6 rounded-[2rem] border-4 border-blue-100 shadow-xl flex justify-between items-center">
            <div>
              <p className="text-blue-400 text-xs font-black uppercase tracking-widest">Players</p>
              <h2 className="text-4xl font-black text-slate-800">{players.length} <span className="text-xl text-slate-300">/ 20</span></h2>
            </div>
            <Users size={40} className="text-blue-200"/>
          </div>

          <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-4 min-h-[300px] flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-xs font-black text-slate-400 uppercase">대기 명단</span>
              <button onClick={copyInviteLink} className="text-[10px] font-bold text-white bg-slate-800 px-3 py-1.5 rounded-full flex gap-1 hover:bg-slate-700 transition-colors">
                {copyStatus==='link'?<CheckCircle2 size={12}/>:<LinkIcon size={12}/>} 초대 링크
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {players.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${p.id===user.uid?'bg-blue-500':'bg-slate-300'}`}></div>
                    <span className={`font-bold ${p.id===user.uid ? 'text-blue-600' : 'text-slate-600'}`}>{p.name}</span>
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
            <button onClick={handleStartRound} className="w-full bg-blue-500 hover:bg-blue-600 text-white p-5 rounded-2xl font-black text-xl shadow-[0_8px_20px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Play size={24} fill="currentColor"/> 게임 시작
            </button>
          ) : (
            <div className="text-center text-slate-400 font-bold animate-pulse py-4">방장이 곧 시작합니다...</div>
          )}
        </div>
      )}

      {/* --- SCENE 3: GAMEPLAY (INPUT) --- */}
      {isJoined && roomData?.status === 'playing' && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto pb-20">
          
          {/* Topic Card */}
          <div className="bg-white border-2 border-yellow-400 p-6 rounded-3xl shadow-[4px_4px_0px_#facc15] text-center mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
              <div className="h-full bg-yellow-400 transition-all duration-1000" style={{width: `${(timeLeft/ROUND_TIME)*100}%`}}></div>
            </div>
            <p className="text-yellow-500 text-xs font-black uppercase tracking-widest mb-1">주제어</p>
            <h2 className="text-3xl font-black text-slate-800 break-keep leading-tight">{roomData.topic}</h2>
            <div className="absolute top-4 right-4 flex items-center gap-1 text-slate-400 font-mono font-bold">
              <Timer size={16}/> {timeLeft}
            </div>
          </div>

          {!isSubmitted ? (
            <div className="flex-1 space-y-3 overflow-y-auto pb-4">
              <p className="text-center text-slate-400 text-xs font-bold mb-2">떠오르는 단어 5개를 적으세요!</p>
              {myAnswers.map((ans, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-6 text-center font-black text-slate-300">{idx+1}</span>
                  <input 
                    value={ans} 
                    onChange={e => handleInputChange(idx, e.target.value)}
                    className="flex-1 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none transition-all shadow-sm"
                    placeholder="..."
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-500 animate-bounce">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-xl font-black text-slate-700">제출 완료!</h3>
              <p className="text-slate-400 text-sm font-bold">다른 친구들을 기다리고 있어요...</p>
            </div>
          )}

          {!isSubmitted && (
            <button 
              onClick={submitAnswers}
              className="mt-4 w-full bg-slate-800 text-white py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all"
            >
              제출하기
            </button>
          )}
          {isHost && timeLeft > 0 && (
            <button onClick={calculateScores} className="mt-2 text-xs text-slate-400 font-bold underline">
              기다리기 지루한가요? 바로 결과 보기
            </button>
          )}
        </div>
      )}

      {/* --- SCENE 4: RESULT --- */}
      {isJoined && roomData?.status === 'result' && (
        <div className="p-4 max-w-lg mx-auto flex flex-col h-[calc(100vh-80px)]">
          <div className="text-center mb-6">
            <span className="text-xs font-bold text-slate-400 uppercase bg-white px-3 py-1 rounded-full border border-slate-200">Round {roomData.round} Result</span>
            <h2 className="text-2xl font-black text-slate-800 mt-2">{roomData.topic}</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pb-20 custom-scrollbar">
            
            {/* 1. 내 점수 카드 */}
            {myPlayer?.lastRoundResult && (
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-20"><Smile size={80}/></div>
                <p className="text-blue-200 text-xs font-bold uppercase">이번 라운드 획득</p>
                <div className="flex items-end gap-2">
                  <h3 className="text-5xl font-black">{myPlayer.lastRoundResult.score}</h3>
                  <span className="text-xl font-bold mb-1">점</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 relative z-10">
                  {myPlayer.lastRoundResult.details.map((d, i) => (
                    <span key={i} className={`px-2 py-1 rounded-lg text-xs font-bold border ${d.point > 0 ? 'bg-white text-blue-600 border-white' : 'bg-blue-700 text-blue-300 border-blue-500'}`}>
                      {d.word} ({d.point > 0 ? d.point : 0})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 2. 전체 통계 (워드 클라우드 스타일) */}
            <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm">
              <h4 className="text-sm font-black text-slate-400 mb-4 flex items-center gap-2"><Users size={16}/> 공감 키워드</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roomData.frequency || {})
                  .sort(([,a], [,b]) => b - a) // 많이 나온 순 정렬
                  .map(([word, count], i) => (
                    <div key={i} className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 border-2 ${count > 1 ? 'bg-yellow-50 border-yellow-400 text-slate-800' : 'bg-slate-50 border-slate-100 text-slate-400 grayscale opacity-70'}`}>
                      <span>{word}</span>
                      <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${count > 1 ? 'bg-yellow-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* 3. 랭킹 */}
            <div className="bg-white p-4 rounded-[2rem] border border-slate-200">
              <h4 className="text-sm font-black text-slate-400 mb-2 px-2 flex items-center gap-2"><Trophy size={16}/> 현재 순위</h4>
              {players.sort((a,b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`font-black w-4 text-center ${i===0?'text-yellow-500 text-xl':'text-slate-300'}`}>{i+1}</span>
                    <span className="font-bold text-slate-700">{p.name}</span>
                  </div>
                  <span className="font-black text-slate-800">{p.score}점</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Action */}
          {isHost && (
            <div className="fixed bottom-6 left-0 w-full px-6 flex justify-center">
              <button 
                onClick={handleStartRound}
                className="w-full max-w-md bg-slate-900 text-white py-4 rounded-2xl font-black text-lg shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ArrowRight size={20} /> 다음 라운드
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
        }
