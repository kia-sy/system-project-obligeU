const sessionId = new URLSearchParams(location.search).get("id");

const statusText = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// STUN lets each browser discover its public address. Without a TURN server, a few
// strict networks (some campus/office Wi-Fi) can still block the call.
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let localStream = null;   // my camera + microphone
let socket = null;        // the line to CallSocket on the server
let peer = null;          // the direct connection to the other person
let queue = Promise.resolve();

function setStatus(text) {
    statusText.textContent = text;
}

function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

// ---------- 1. camera and microphone ----------
async function getMedia() {
    if (!navigator.mediaDevices) {
        throw new Error("Camera access needs https:// (or localhost).");
    }
    try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (error) {
        // camera busy or missing: try voice only
        return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
}

// ---------- 2. the direct connection ----------
function newPeer() {
    if (peer) peer.close();
    peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // send my camera/microphone over this connection
    localStream.getTracks().forEach(function (track) {
        peer.addTrack(track, localStream);
    });

    // show the other person when their stream arrives
    peer.ontrack = function (event) {
        remoteVideo.srcObject = event.streams[0];
    };

    // each possible network route found is passed to the other browser
    peer.onicecandidate = function (event) {
        if (event.candidate) send({ type: "candidate", candidate: event.candidate });
    };

    peer.onconnectionstatechange = function () {
        if (peer.connectionState === "connected") setStatus("Connected");
        if (peer.connectionState === "failed") {
            setStatus("Could not connect. Your network may be blocking the call.");
        }
    };
}

// ---------- 3. messages from the other person (through the server) ----------
async function handle(message) {

    if (message.type === "start") {
        // the other person just arrived and I was already here, so I make the offer
        setStatus("Connecting...");
        newPeer();
        await peer.setLocalDescription(await peer.createOffer());
        send({ type: "offer", sdp: peer.localDescription });

    } else if (message.type === "offer") {
        setStatus("Connecting...");
        newPeer();
        await peer.setRemoteDescription(message.sdp);
        await peer.setLocalDescription(await peer.createAnswer());
        send({ type: "answer", sdp: peer.localDescription });

    } else if (message.type === "answer") {
        await peer.setRemoteDescription(message.sdp);

    } else if (message.type === "candidate") {
        try {
            await peer.addIceCandidate(message.candidate);
        } catch (error) { /* a late route for a connection that is already gone */ }

    } else if (message.type === "left") {
        if (peer) peer.close();
        peer = null;
        remoteVideo.srcObject = null;
        setStatus("The other person left. Waiting for them to come back...");
    }
}

// ---------- start everything ----------
async function startCall() {
    if (!sessionId) { setStatus("No session was given."); return; }

    try {
        setStatus("Asking for your camera and microphone...");
        localStream = await getMedia();
        localVideo.srcObject = localStream;
    } catch (error) {
        setStatus(error.message || "Could not use your camera or microphone.");
        return;
    }

    // ask the server for a one-time ticket (it checks this is your session)
    setStatus("Joining...");
    const response = await fetch("virtual-help", {
        method: "POST",
        body: new URLSearchParams({ action: "ticket", id: sessionId })
    });
    if (response.status === 401) { window.location.replace("obligeU.html"); return; }
    if (!response.ok) {
        setStatus("This session is not available. It may not have started yet, or it has ended.");
        return;
    }
    const data = await response.json();

    // open the line to the server: same host and folder as this page
    const scheme = location.protocol === "https:" ? "wss://" : "ws://";
    const folder = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1);
    socket = new WebSocket(scheme + location.host + folder + "call-socket?ticket=" + data.ticket);

    socket.onopen = function () {
        setStatus("Waiting for the other person to join...");
    };

    socket.onmessage = function (event) {
        const message = JSON.parse(event.data);
        // handle messages one at a time, in order (some steps take a moment)
        queue = queue.then(function () { return handle(message); }).catch(function (e) { console.error(e); });
    };

    socket.onclose = function () {
        if (localStream) setStatus("Disconnected from the call.");
    };
}

// ---------- buttons ----------
document.getElementById("micButton").addEventListener("click", function () {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.textContent = track.enabled ? "Mute" : "Unmute";
    this.classList.toggle("off", !track.enabled);
});

document.getElementById("camButton").addEventListener("click", function () {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.textContent = track.enabled ? "Camera off" : "Camera on";
    this.classList.toggle("off", !track.enabled);
});

document.getElementById("leave").addEventListener("click", leave);

function leave() {
    if (socket) socket.close();
    if (peer) peer.close();
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    setStatus("You left the call. You can close this tab.");
    window.close();   // works because the dashboard opened this tab
}

window.addEventListener("beforeunload", function () {
    if (socket) socket.close();
});

startCall();