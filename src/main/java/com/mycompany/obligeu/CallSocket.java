package com.mycompany.obligeu;

import jakarta.websocket.CloseReason;
import jakarta.websocket.OnClose;
import jakarta.websocket.OnError;
import jakarta.websocket.OnMessage;
import jakarta.websocket.OnOpen;
import jakarta.websocket.Session;
import jakarta.websocket.server.ServerEndpoint;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The "signaling" server for the video call.
 *
 * Video and audio travel directly between the two browsers (WebRTC). The browsers
 * only need a go-between to swap a few small text messages first (who they are, how
 * to reach each other). This class is that go-between: it puts two people in a
 * room and passes each one's messages to the other. It never sees any video.
 *
 * Connecting needs a one-time ticket from VirtualHelpServlet (action=ticket), which
 * is only given to the student or helper of an active session.
 */
@ServerEndpoint("/call-socket")
public class CallSocket {

    private static class Ticket {
        final String room;
        final long expires;
        Ticket(String room, long expires) { this.room = room; this.expires = expires; }
    }

    private static final Map<String, Ticket> TICKETS = new ConcurrentHashMap<>();
    private static final Map<String, Set<Session>> ROOMS = new ConcurrentHashMap<>();

    /** Called by VirtualHelpServlet. The ticket works once, within 30 seconds. */
    static String issueTicket(String room) {
        long now = System.currentTimeMillis();
        TICKETS.values().removeIf(t -> t.expires < now);          // forget unused old tickets
        String ticket = UUID.randomUUID().toString();
        TICKETS.put(ticket, new Ticket(room, now + 30_000));
        return ticket;
    }

    private static void send(Session to, String text) {
        synchronized (to) {                                       // one send at a time per connection
            try {
                if (to.isOpen()) to.getBasicRemote().sendText(text);
            } catch (IOException e) {
                // that person has gone; their @OnClose will clean up
            }
        }
    }

    private static void reject(Session session, String why) throws IOException {
        session.close(new CloseReason(CloseReason.CloseCodes.VIOLATED_POLICY, why));
    }

    @OnOpen
    public void onOpen(Session session) throws IOException {

        // the browser connects to /call-socket?ticket=...
        List<String> given = session.getRequestParameterMap().get("ticket");
        Ticket ticket = given == null ? null : TICKETS.remove(given.get(0));   // remove = single use
        if (ticket == null || ticket.expires < System.currentTimeMillis()) {
            reject(session, "bad ticket");
            return;
        }

        Set<Session> room = ROOMS.computeIfAbsent(ticket.room, k -> ConcurrentHashMap.newKeySet());
        synchronized (room) {
            if (room.size() >= 2) {                               // a call is for exactly two people
                reject(session, "room full");
                return;
            }
            session.getUserProperties().put("room", ticket.room);
            room.add(session);

            // someone is already waiting: tell them to start the connection
            for (Session other : room) {
                if (other != session) send(other, "{\"type\":\"start\"}");
            }
        }
    }

    // SDP descriptions can be several KB, so allow bigger messages than the 8 KB default
    @OnMessage(maxMessageSize = 65536)
    public void onMessage(String message, Session session) {
        Set<Session> room = ROOMS.get((String) session.getUserProperties().get("room"));
        if (room == null) return;
        for (Session other : room) {
            if (other != session) send(other, message);           // pass it on, untouched
        }
    }

    @OnClose
    public void onClose(Session session) {
        String name = (String) session.getUserProperties().get("room");
        if (name == null) return;                                 // never got into a room
        Set<Session> room = ROOMS.get(name);
        if (room == null) return;
        synchronized (room) {
            room.remove(session);
            for (Session other : room) send(other, "{\"type\":\"left\"}");
            if (room.isEmpty()) ROOMS.remove(name);
        }
    }

    @OnError
    public void onError(Session session, Throwable error) {
        try {
            session.close();
        } catch (IOException e) {
            // already closed
        }
    }
}