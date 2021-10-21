// This script is using firebase v9 and has a couple of comms bug in it. 
import './style.css';
import { initializeApp } from '@firebase/app';
import { getFirestore, collection, doc, setDoc, onSnapshot, getDoc, query, where } from 'firebase/firestore';


const firebaseConfig = {
 // your config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

console.log('This works');
// 1. Setup media sources
webcamButton.onclick = async () => {
  console.log('I repeat, here we foken go!');
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};


// 2. Create an offer
callButton.onclick = async () => {
  // create a call collection in the firestore
  const callDoc = doc(collection(db, 'calls'));
  console.log(callDoc)

  // create offerCandidates and answerCandidates collection inside callDoc -> the parent collection
  // const offerCandidates = setDoc(callDoc, doc(collection(db, 'offerCandidates')));
  const offerCandidates = doc(db, 'calls', "offerCandidates");
  // const answerCandidates = setDoc(callDoc, collection(db, 'calls/answerCandidates'));
  const answerCandidates = doc(db, 'calls', "answerCandidates");

  // set callInput value to the id of the parent collection
  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };
 
  await setDoc(callDoc, { offer });

  console.log('Write complete')

  // Listen for remote answer
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(collection(db, 'answerCandidates'), (snapshot) => {
    // console.log(snapshot.docChanges())
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  })
  console.log('done here!')
  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  let callDoc = collection(db, 'calls');
  callDoc = query(callDoc, where('doc.id', '==', callId));
  const offerCandidates = doc(db, 'calls', "offerCandidates");
  const answerCandidates = doc(db, 'calls', "answerCandidates");

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await getDoc(callDoc));
  // callData.forEach((doc) => {
  //   if(doc.id == callId) {
      const offerDescription = callData.offer;
      console.log(typeof offerDescription)
      await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
  //   };
  // });
  console.log('sah?')
  

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDoc, { answer })
  // await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    console.log('Yes or yes?')
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

console.log('are we done?')
