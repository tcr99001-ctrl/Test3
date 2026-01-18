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
  Merge, Undo2, ChevronLeft, MousePointerClick, X
} from 'lucide-react';

// ==================================================================
// [완료] 기존 Firebase 설정값 유지
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

export default function NeodoNadoGame() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myAnswers, setMyAnswers] = useState(['', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState(initError);
  const [copyStatus, setCopyStatus] = useState(null);
  
  // 검토 단계용 상태 (로컬)
  const [selectedWords, setSelectedWords] = useState([]); // 병합 대기열 IDs

  const isJoined = user && players.some(p => p.id === user.uid);
  const isHost = roomData?.hostId === user?.uid;

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
      startReviewPhase();
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
      topic: '', endTime: 0, reviewData: [], mergedGroups: [], // mergedGroups: 실행취소용 히스토리
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
    
    const resetUpdates = players.map(p => updateDoc(doc(db,'rooms',roomCode,'players',p.id), { currentAnswers: null }));
    await Promise.all(resetUpdates);

    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'playing', topic, endTime, 
      round: (roomData.round || 0) + 1,
      reviewData: [], mergedGroups: []
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

  // --- [IMPROVED] Review Logic ---
  const startReviewPhase = async () => {
    if(!isHost) return;

    const rawWords = [];
    players.forEach(p => {
      if(p.currentAnswers) {
        p.currentAnswers.forEach(word => {
          rawWords.push({ 
            id: Math.random().toString(36).substr(2,9),
            word: word.trim(), 
            originalWord: word.trim(), // 복구용 원본 데이터
            owner: p.name, 
            mergedGroupId: null // 병합된 그룹 ID (null이면 병합 안됨)
          });
        });
      }
    });

    await updateDoc(doc(db,'rooms',roomCode), {
      status: 'review',
      reviewData: rawWords,
      mergedGroups: []
    });
  };

  // 단어 선택/해제 (로컬 상태)
  const toggleSelectWord = (wordId) => {
    if(!isHost) return;
    vibrate();
    if(selectedWords.includes(wordId)) {
      setSelectedWords(selectedWords.filter(id => id !== wordId));
    } else {
      setSelectedWords([...selectedWords, wordId]);
    }
  };

  // 병합 실행
  const mergeWords = async () => {
    if(!isHost || selectedWords.length < 2) return;
    vibrate();

    // 첫 번째 선택된 단어를 대표 단어로 설정
    const targetId = selectedWords[0];
    const targetWordObj = roomData.reviewData.find(w => w.id === targetId);
    const targetWord = targetWordObj.word;
    const groupId = Math.random().toString(36).substr(2,9); // 그룹 ID 생성

    // DB 업데이트
    const newReviewData = roomData.reviewData.map(item => {
      if(selectedWords.includes(item.id)) {
        return { ...item, word: targetWord, mergedGroupId: groupId };
      }
      return item;
    });

    // 히스토리에 추가 (실행 취소용)
    const newGroupInfo = { id: groupId, word: targetWord, count: selectedWords.length };
    const newMergedGroups = [...(roomData.mergedGroups || []), newGroupInfo];

    await updateDoc(doc(db,'rooms',roomCode), { 
      reviewData: newReviewData,
      mergedGroups: newMergedGroups
    });
    setSelectedWords([]);
  };

  // 병합 취소 (Undo)
  const undoMerge = async (groupId) => {
    if(!isHost) return;
    if(!window.confirm("이 병합을 취소하시겠습니까?")) return;
    vibrate();

    // 해당 그룹 ID를 가진 단어들을 원상복구
    const newReviewData = roomData.reviewData.map(item => {
      if(item.mergedGroupId === groupId) {
        return { ...item, word: item.originalWord, mergedGroupId: null };
      }
      return item;
    });

    const newMergedGroups = roomData.mergedGroups.filter(g => g.id !== groupId);

    await updateDoc(doc(db,'rooms',roomCode), { 
      reviewData: newReviewData,
      mergedGroups: newMergedGroups
    });
  };

  // 결과 집계 (최종 컨펌)
  const calculateScores = async () => {
    if(!isHost) return;
    
    // 안전장치: 병합되지 않은 단어가 많은데 넘어가는지 체크? (선택사항)
    if(!window.confirm("검토를 마치고 점수를 집계하시겠습니까?")) return;
    
    vibrate();
    
    const frequency = {};
    roomData.reviewData.forEach(item => {
      const w = item.word;
      frequency[w] = (frequency[w] || 0) + 1;
    });

    const updates = players.map(p => {
      let roundScore = 0;
      const scoredWords = [];
      const myItems = roomData.reviewData.filter(item => item.owner === p.name);
      
      myItems.forEach(item => {
        const count = frequency[item.word] || 0;
        if (count > 1) {
          roundScore += count;
          scoredWords.push({ word: item.word, point: count });
        } else {
          scoredWords.push({ word: item.word, point: 0 });
        }
      });

      const currentTotal = p.score || 0;
      return updateDoc(doc(db,'rooms',roomCode,'players',p.id), {
        score: currentTotal + roundScore,
        lastRoundResult: { score: roundScore, details: scoredWords }
      });
    });

    await Promise.all(updates);
    await updateDoc(doc(db,'rooms',roomCode), { status: 'result', frequency });
  };

  // 결과 화면에서 다시 검토 화면으로 복귀 (실수 방지)
  const backToReview = async () => {
    if(!isHost) return;
    if(!window.confirm("점수 집계를 취소하고 다시 검토하시겠습니까?")) return;
    await updateDoc(doc(db,'rooms',roomCode), { status: 'review' });
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

  // --- RENDER ---
  if(!user) return <div className="h-screen flex items-center justify-center bg-yellow-50 font-bold text-yellow-600">Loading...</div>;

  // 검토 단계 데이터 필터링
  const getReviewItems = () => {
    if (!roomData?.reviewData) return {};
    // 아직 병합되지 않은 단어들만 참가자별로 그룹화
    const activeItems = roomData.reviewData.filter(item => !item.mergedGroupId && !selectedWords.includes(item.id));
    
    // owner별로 그룹핑
    const grouped = {};
    activeItems.forEach(item => {
      if (!grouped[item.owner]) grouped[item.owner] = [];
      grouped[item.owner].push(item);
    });
    return grouped;
  };

  const getStagingItems = () => {
    if (!roomData?.reviewData) return [];
    return roomData.reviewData.filter(item => selectedWords.includes(item.id));
  };

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
          {isHost && timeLeft > 0 && <button onClick={startReviewPhase} className="mt-2 text-xs text-slate-400 font-bold underline">기다리기 지루한가요? 검토 시작</button>}
        </div>
      )}

      {/* 4. Review Phase (UI 개선됨) */}
      {isJoined && roomData?.status === 'review' && (
        <div className="flex flex-col h-[calc(100vh-80px)] p-4 max-w-lg mx-auto relative">
          <div className="text-center mb-4">
            <h3 className="text-xl font-black text-slate-800">정답 검토</h3>
            <p className="text-xs text-slate-400 font-bold">비슷한 단어를 눌러서 합쳐주세요!</p>
          </div>

          {/* User Cards Grid */}
          <div className="flex-1 overflow-y-auto space-y-4 pb-48 custom-scrollbar">
            {Object.entries(getReviewItems()).map(([owner, items]) => (
              <div key={owner} className="bg-white border-2 border-slate-100 rounded-2xl p-3 shadow-sm">
                <p className="text-xs font-black text-slate-400 mb-2 px-1">{owner}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map(item => (
                    <button 
                      key={item.id} 
                      onClick={() => toggleSelectWord(item.id)}
                      disabled={!isHost}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      {item.word}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Merged History (Undo) */}
            {roomData.mergedGroups?.length > 0 && (
              <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 mt-6">
                <p className="text-xs font-black text-blue-400 mb-2 flex items-center gap-1"><Merge size={12}/> 합쳐진 단어들 (누르면 취소)</p>
                <div className="flex flex-wrap gap-2">
                  {roomData.mergedGroups.map(group => (
                    <button 
                      key={group.id} 
                      onClick={() => undoMerge(group.id)}
                      disabled={!isHost}
                      className="px-3 py-1 bg-white border border-blue-200 rounded-lg text-xs font-bold text-blue-600 flex items-center gap-1 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all"
                    >
                      {group.word} <span className="bg-blue-100 text-blue-600 px-1.5 rounded-full">{group.count}</span> <X size={10}/>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Staging Area (Bottom Fixed) */}
          <div className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-slate-100 p-4 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10">
            <div className="max-w-lg mx-auto">
              
              {/* Selected Words */}
              {selectedWords.length > 0 ? (
                <div className="mb-4">
                  <p className="text-xs font-bold text-slate-400 mb-2 ml-1">합칠 단어 ({selectedWords.length})</p>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {getStagingItems().map(item => (
                      <button key={item.id} onClick={() => toggleSelectWord(item.id)} className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md flex items-center gap-1">
                        {item.word} <X size={12} className="opacity-50"/>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-4 text-center py-2 text-slate-400 text-xs font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  단어를 선택해서 이곳에 담으세요
                </div>
              )}

              {isHost ? (
                <div className="flex gap-2">
                  <button 
                    onClick={mergeWords}
                    disabled={selectedWords.length < 2}
                    className="flex-1 bg-blue-500 disabled:bg-slate-300 text-white py-3 rounded-xl font-black text-lg shadow-lg transition-all"
                  >
                    합치기
                  </button>
                  <button 
                    onClick={calculateScores}
                    className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-black text-lg shadow-lg"
                  >
                    점수 계산
                  </button>
                </div>
              ) : (
                <div className="text-center text-slate-500 text-sm font-bold animate-pulse py-3">방장이 검토 중입니다...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Result Phase */}
      {isJoined && roomData?.status === 'result' && (
        <div className="p-4 max-w-lg mx-auto flex flex-col h-[calc(100vh-80px)]">
          <div className="text-center mb-6">
            <span className="text-xs font-bold text-slate-400 uppercase bg-white px-3 py-1 rounded-full border border-slate-200">Round {roomData.round} Result</span>
            <h2 className="text-2xl font-black text-slate-800 mt-2">{roomData.topic}</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pb-20 custom-scrollbar">
            {myPlayer?.lastRoundResult && (
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-20"><Smile size={80}/></div>
                <p className="text-blue-200 text-xs font-bold uppercase">이번 라운드 획득</p>
                <div className="flex items-end gap-2"><h3 className="text-5xl font-black">{myPlayer.lastRoundResult.score}</h3><span className="text-xl font-bold mb-1">점</span></div>
                <div className="mt-4 flex flex-wrap gap-2 relative z-10">
                  {myPlayer.lastRoundResult.details.map((d, i) => (
                    <span key={i} className={`px-2 py-1 rounded-lg text-xs font-bold border ${d.point > 0 ? 'bg-white text-blue-600 border-white' : 'bg-blue-700 text-blue-300 border-blue-500'}`}>{d.word} ({d.point > 0 ? d.point : 0})</span>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm">
              <h4 className="text-sm font-black text-slate-400 mb-4 flex items-center gap-2"><Users size={16}/> 공감 키워드</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roomData.frequency || {}).sort(([,a], [,b]) => b - a).map(([word, count], i) => (
                  <div key={i} className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 border-2 ${count > 1 ? 'bg-yellow-50 border-yellow-400 text-slate-800' : 'bg-slate-50 border-slate-100 text-slate-400 grayscale opacity-70'}`}>
                    <span>{word}</span><span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full ${count > 1 ? 'bg-yellow-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-[2rem] border border-slate-200">
              <h4 className="text-sm font-black text-slate-400 mb-2 px-2 flex items-center gap-2"><Trophy size={16}/> 현재 순위</h4>
              {players.sort((a,b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3"><span className={`font-black w-4 text-center ${i===0?'text-yellow-500 text-xl':'text-slate-300'}`}>{i+1}</span><span className="font-bold text-slate-700">{p.name}</span></div>
                  <span className="font-black text-slate-800">{p.score}점</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div className="fixed bottom-6 left-0 w-full px-6 flex justify-center gap-2">
              <button onClick={backToReview} className="bg-white text-slate-500 border-2 border-slate-200 p-4 rounded-2xl shadow-lg active:scale-95 transition-all"><Undo2/></button>
              <button onClick={handleStartRound} className="flex-1 max-w-xs bg-slate-900 text-white py-4 rounded-2xl font-black text-lg shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"><ArrowRight size={20} /> 다음 라운드</button>
            </div>
          )}
        </div>
      )}

    </div>
  );
        }
