const io = require("socket.io")(3002, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
  },
});

let peers = {}; // Store connected peers

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Register a peer
  socket.on("register", ({ userId }) => {
    peers[socket.id] = userId;
    console.log("Registered peer:", userId, "ID:", socket.id);
    console.log("Peers:", peers);

    // Broadcast updated peer list to all clients
    io.emit("peer-list", Object.values(peers));
  });

  // Relay signaling messages
  socket.on("offer", ({ target, offer }) => {
    console.log(`Offer received from ${socket.id} to ${target}`);
    const targetSocket = Object.keys(peers).find((key) => peers[key] === target);
    if (targetSocket) {
      io.to(targetSocket).emit("offer", { offer, sender: peers[socket.id] });
      console.log("Offer sent to:", targetSocket);
    } else {
      console.log(`Target ${target} not found`);
    }
  });

  // Handle call rejection
  socket.on("call-rejected", ({ target }) => {
    const targetSocket = Object.keys(peers).find((key) => peers[key] === target);
    if (targetSocket) {
      io.to(targetSocket).emit("call-rejected");
      console.log(`Call rejected by ${peers[socket.id]} to ${target}`);
    }
  });

  // Relay answer signaling
  socket.on("answer", ({ target, answer }) => {
    console.log(`Answer received from ${socket.id} to ${target}`);
    const targetSocket = Object.keys(peers).find((key) => peers[key] === target);
    if (targetSocket) {
      io.to(targetSocket).emit("answer", { answer });
      console.log("Answer sent to:", targetSocket);
    } else {
      console.log(`Target ${target} not found`);
    }
  });

  // Relay ICE candidates
  socket.on("ice-candidate", ({ target, candidate }) => {
    console.log(`ICE candidate received from ${socket.id} to ${target}`);
    const targetSocket = Object.keys(peers).find((key) => peers[key] === target);
    if (targetSocket) {
      io.to(targetSocket).emit("ice-candidate", { candidate });
      console.log("ICE candidate sent to:", targetSocket);
    } else {
      console.log(`Target ${target} not found`);
    }
  });

  // Handle call end
  socket.on("call-ended", ({ target }) => {
    // Find the target socket ID using the target user ID
    const targetSocket = Object.keys(peers).find((key) => peers[key] === target);
  
    if (targetSocket) {
      // Emit the "call-ended" event to the target peer
      io.to(targetSocket).emit("call-ended", { target: target });
      console.log(`Call ended by ${peers[socket.id]} with ${target}`);
    } else {
      console.log("Target socket not found for call end.");
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    delete peers[socket.id];
    io.emit("peer-list", Object.values(peers)); // Update the peer list after disconnection
  });
});
