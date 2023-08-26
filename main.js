// Set your Agora App ID
let APP_ID = "e5e76793a01145768a683185cda592c7";

// Initialize variables
let token = null; // Agora token for authentication (currently unused)
let uid = String(Math.floor(Math.random() * 10000)); // Generate a random user ID
let client;
let channel;

// Get room ID from the URL query parameters
let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

// Redirect to the lobby if room ID is missing
if (!roomId) {
    window.location = 'lobby.html';
}

// Prepare to store streams, connections, and servers configuration
let localStream;
let remoteStream;
let peerConnection;
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
};

// Constraints for the user's local media stream
let constraints = {
    video: {
        width: { min: 640, ideal: 1920, max: 1920 },
        height: { min: 480, ideal: 1080, max: 1080 }
    },
    audio: true
};

// Initialize the application
let init = async () => {
    // Create an Agora RTM instance and log in with the generated user ID
    client = await AgoraRTM.createInstance(APP_ID);
    await client.login({ uid, token });

    // Create a channel for the current room and join it
    channel = client.createChannel(roomId);
    await channel.join();

    // Set up event handlers for user actions
    channel.on('MemberJoined', handleUserJoined);
    channel.on('MemberLeft', handleUserLeft);
    client.on('MessageFromPeer', handleMessageFromPeer);

    // Get access to the user's media stream and display it locally
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('user-1').srcObject = localStream;
};

// Handler for when a user leaves the channel
let handleUserLeft = (MemberId) => {
    // Hide the remote user's video and reset the layout
    document.getElementById('user-2').style.display = 'none';
    document.getElementById('user-1').classList.remove('smallFrame');
};

// Handler for receiving messages from peers
let handleMessageFromPeer = async (message, MemberId) => {
    message = JSON.parse(message.text);

    if (message.type === 'offer') {
        // Respond to an offer by creating an answer
        createAnswer(MemberId, message.offer);
    }

    if (message.type === 'answer') {
        // Handle an incoming answer
        addAnswer(message.answer);
    }

    if (message.type === 'candidate') {
        // Add ICE candidate to establish connectivity
        if (peerConnection) {
            peerConnection.addIceCandidate(message.candidate);
        }
    }
};

// Handler for when a new user joins the channel
let handleUserJoined = async (MemberId) => {
    console.log('A new user joined the channel:', MemberId);
    // Create an offer to initiate connection with the new user
    createOffer(MemberId);
};

// Create a new PeerConnection and set it up
let createPeerConnection = async (MemberId) => {
    // Create a PeerConnection using predefined servers
    peerConnection = new RTCPeerConnection(servers);

    // Initialize the remote stream container and display it
    remoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = remoteStream;
    document.getElementById('user-2').style.display = 'block';

    // Resize the local video to a smaller frame
    document.getElementById('user-1').classList.add('smallFrame');

    // Get local stream and add its tracks to the PeerConnection
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById('user-1').srcObject = localStream;
    }

    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming tracks from the remote user
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    // Handle ICE candidate events for establishing connectivity
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            // Send ICE candidate information to the remote user
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId);
        }
    };
};

// Create an offer and send it to the remote user
let createOffer = async (MemberId) => {
    await createPeerConnection(MemberId);

    // Create an offer and set it as the local description
    let offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Send the offer to the remote user
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId);
};

// Create an answer to respond to a received offer
let createAnswer = async (MemberId, offer) => {
    await createPeerConnection(MemberId);

    // Set the remote offer as the remote description
    await peerConnection.setRemoteDescription(offer);

    // Create an answer and set it as the local description
    let answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send the answer to the remote user
    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId);
};

// Add an incoming answer to the PeerConnection
let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer);
    }
};

// Handler for leaving the channel
let leaveChannel = async () => {
    // Leave the Agora channel and log out
    await channel.leave();
    await client.logout();
};

// Handlers for toggling camera and microphone
let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video');

    if (videoTrack.enabled) {
        // Disable the camera
        videoTrack.enabled = false;
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    } else {
        // Enable the camera
        videoTrack.enabled = true;
        document.getElementById('camera-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)';
    }
};

let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio');

    if (audioTrack.enabled) {
        // Disable the microphone
        audioTrack.enabled = false;
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(255, 80, 80)';
    } else {
        // Enable the microphone
        audioTrack.enabled = true;
        document.getElementById('mic-btn').style.backgroundColor = 'rgb(179, 102, 249, .9)';
    }
};

// Add event listeners and initialize the application
window.addEventListener('beforeunload', leaveChannel);
document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);
init();
