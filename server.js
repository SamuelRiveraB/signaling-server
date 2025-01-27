const io = require("socket.io")(3002, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let peers = {}; // Store connected peers

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Register a peer
  socket.on("register", async ({ id, role, firstName, lastName, address, socketId, photo, company, rating, location, jobId }) => {
    const data = { id, role, firstName, lastName, socketId, photo, location };
    if(role === "user") {
      peers[socket.id] = { ...data, address};
    }
    else if(role === "technician") {
      peers[socket.id] = { ...data, available: false, company, rating, jobId };
    }
    console.log(`Registered ${role}:`, socketId);
    console.log("Peers:", peers);

    if (role === "user") {
      io.emit(
        "peer-list",
        Object.values(peers).filter((peer) => peer.role === "technician")
      );
    }
  });

  // CALLS -----------------------------------------------------------

  // Relay signaling messages
  socket.on("offer", ({ target, offer }) => {
    console.log(`Offer received from ${socket.id} to ${target}`);
    const targetSocket = Object.keys(peers).find((key) => peers[key].socketId === target);
    if (targetSocket) {
      io.to(targetSocket).emit("offer", { offer, sender: peers[socket.id].socketId });
      console.log("Offer sent to:", targetSocket);
    } else {
      console.log(`Target ${target} not found`);
    }
  });

  // Handle call rejection
  socket.on("call-rejected", ({ target }) => {
    const targetSocket = Object.keys(peers).find((key) => peers[key].socketId === target);
    if (targetSocket) {
      io.to(targetSocket).emit("call-rejected");
      console.log(`Call rejected by ${peers[socket.id].socketId} to ${target}`);
    }
  });

  // Relay answer signaling
  socket.on("answer", ({ target, answer }) => {
    console.log(`Answer received from ${socket.id} to ${target}`);
    const targetSocket = Object.keys(peers).find((key) => peers[key].socketId === target);
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
    const targetSocket = Object.keys(peers).find((key) => peers[key].socketId === target);
    if (targetSocket) {
      io.to(targetSocket).emit("ice-candidate", { candidate });
      console.log("ICE candidate sent to:", targetSocket);
    } else {
      console.log(`Target ${target} not found`);
    }
  });

  // Handle call end
  socket.on("call-ended", ({ target }) => {
    // Find the target socket ID using the target socket ID
    const targetSocket = Object.keys(peers).find((key) => peers[key].socketId === target);
  
    if (targetSocket) {
      // Emit the "call-ended" event to the target peer
      io.to(targetSocket).emit("call-ended", { target });
      console.log(`Call ended by ${peers[socket.id].socketId} with ${target}`);
    } else {
      console.log("Target socket not found for call end.");
    }
  });

  // LOCATION ---------------------------------------------------

  socket.on("send-location", (location) => {
    if (peers[socket.id]) {
      peers[socket.id].location = location;

      Object.keys(peers).forEach((peerSocketId) => {
        if (peers[peerSocketId].role === "user") {
          io.to(peerSocketId).emit(
            "peer-list",
            Object.values(peers).filter((peer) => peer.role === "technician")
          );
        }
      });
    }
  });

  socket.on("hire", ({ technicianId, clientId }) => {
    const technicianSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === technicianId
    );

    if (technicianSocket) {
      const clientSocket = Object.keys(peers).find(
        (id) => peers[id].socketId === clientId
      );

      const clientLocation = peers[clientSocket]?.location;

      if (clientLocation) {
        io.to(technicianSocket).emit("hire-request", {
          clientId,
          location: clientLocation,
        });

        console.log(
          `User ${clientId} wants to hire Technician ${technicianId}`
        );
      } else {
        console.log(`Client ${clientId} location is not available`);
      }
    } else {
      console.log(`Technician ${technicianId} is not available`);
    }
  });

  socket.on("hire-response", ({ response, clientId, technicianId }) => {
    const clientSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === clientId
    );
    const technicianSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === technicianId
    );

    if (response === "accept") {
      if (peers[technicianSocket]) {
        peers[technicianSocket].available = false;
      }

      io.to(clientSocket).emit("hire-accepted", {
        technicianId,
      });

      io.to(technicianSocket).emit("on-job", { clientId });

      io.to(technicianSocket).emit(
        "peer-list",
        Object.values(peers).filter((peer) => peer.socketId === clientId)
      );

      const clientLocation = peers[clientSocket]?.location;
      console.log(
        `Technician ${technicianId} accepted the job from ${clientId} at location ${clientLocation.lat} ${clientLocation.lng}`
      );
    } else if (response === "reject") {
      io.to(clientSocket).emit("hire-rejected", {
        technicianId,
      });

      console.log(
        `Technician ${technicianId} rejected the job from ${clientId}`
      );
    }
  });

  socket.on("toggle-availability", (available) => {
    if (peers[socket.id] && peers[socket.id].role === "technician") {
      peers[socket.id].available = available;

      Object.keys(peers).forEach((peerSocketId) => {
        if (peers[peerSocketId].role === "user") {
          io.to(peerSocketId).emit(
            "peer-list",
            Object.values(peers).filter((peer) => peer.role === "technician")
          );
        }
      });
    }
  });

  socket.on("cancel-service", ({ clientId, technicianId }) => {
    const clientSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === clientId
    );
    const technicianSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === technicianId
    );

    if (peers[technicianSocket]) {
      peers[technicianSocket].available = true;
    }

    io.to(clientSocket).emit("service-cancelled");
    io.to(technicianSocket).emit("service-cancelled");

    console.log(
      `Job between client ${clientId} and technician ${technicianId} was cancelled.`
    );
  });

  socket.on("end-service", ({ clientId, technicianId }) => {
    const clientSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === clientId
    );
    const technicianSocket = Object.keys(peers).find(
      (id) => peers[id].socketId === technicianId
    );

    if (peers[technicianSocket]) {
      peers[technicianSocket].available = true;
    }

    io.to(clientSocket).emit("service-ended", {
      message: "The job has been completed!",
    });
    io.to(technicianSocket).emit("service-ended", {
      message: "Job completed!",
    });

    console.log(
      `Job between client ${clientId} and technician ${technicianId} is complete.`
    );
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const peer = peers[socket.id];
    if (peer) {
      if (peer.role === "technician") {
        peer.available = false;
      }
    }
    delete peers[socket.id];
    Object.keys(peers).forEach((peerSocketId) => {
      if (peers[peerSocketId].role === "user") {
        io.to(peerSocketId).emit(
          "peer-list",
          Object.values(peers).filter((peer) => peer.role === "technician")
        );
      }
    });
  });
});
