package com.mycompany.obligeu;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/**
 * GET  /virtual-help                        -> student: their own sessions
 *                                              organization: the anonymous queue (+ calls they joined)
 * POST /virtual-help  subject,topic,schedule -> student: ask for a session
 * POST /virtual-help  action=join&id=N       -> organization: take a waiting request
 * POST /virtual-help  action=ticket&id=N     -> student/helper of an active session: ticket for the call
 * POST /virtual-help  action=finish&id=N     -> the student or the helper: end an active session
 * POST /virtual-help  action=cancel&id=N     -> student: withdraw a request nobody has taken yet
 *
 * The call itself is our own WebRTC call (call.html + CallSocket). The random "room"
 * column is the call's room name and stays on the server.
 */
@WebServlet("/virtual-help")
public class VirtualHelpServlet extends HttpServlet {

    // ---------- JSON ----------

    /** One session as JSON. The room name is never sent to the browser. */
    private static void sessionJson(StringBuilder json, ResultSet rs) throws SQLException {
        json.append("{\"id\":").append(rs.getInt("id"))
            .append(",\"subject\":\"").append(Web.esc(rs.getString("subject")))
            .append("\",\"topic\":\"").append(Web.esc(rs.getString("topic")))
            .append("\",\"scheduledAt\":\"").append(Web.esc(rs.getTimestamp("scheduled_at").toString()))
            .append("\",\"createdAt\":\"").append(Web.esc(rs.getTimestamp("created_at").toString()))
            .append("\",\"status\":\"").append(Web.esc(rs.getString("status")))
            .append("\"}");
    }

    private static void sendJson(HttpServletResponse resp, String json) throws IOException {
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(json);
    }

    // ---------- GET ----------

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        try (Connection conn = db.get()) {

            String role = Web.roleOf(conn, userId);
            String sql;
            boolean student;

            if ("student".equals(role)) {
                student = true;
                // the student's own sessions (cancelled ones are hidden)
                sql = "SELECT id, subject, topic, scheduled_at, created_at, status "
                    + "FROM virtual_requests WHERE student_id = ? AND status <> 'cancelled' "
                    + "ORDER BY created_at DESC, id DESC LIMIT 20";
            } else if ("organization".equals(role)) {
                student = false;
                // waiting requests from anyone + active calls this member joined.
                // No student columns are selected, so the queue stays anonymous.
                sql = "SELECT id, subject, topic, scheduled_at, created_at, status "
                    + "FROM virtual_requests WHERE status = 'waiting' OR (status = 'active' AND helper_id = ?) "
                    + "ORDER BY scheduled_at, id";
            } else {
                resp.setStatus(403);
                return;
            }

            StringBuilder json = new StringBuilder("[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) json.append(",");
                        first = false;
                        sessionJson(json, rs);
                    }
                }
            }
            json.append("]");
            sendJson(resp, json.toString());

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    // ---------- POST ----------

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        req.setCharacterEncoding("UTF-8");
        String action = req.getParameter("action");
        if (action == null) action = "create";

        try (Connection conn = db.get()) {

            String role = Web.roleOf(conn, userId);

            switch (action) {
                case "create": create(req, resp, conn, userId, role); break;
                case "join":   join(req, resp, conn, userId, role);   break;
                case "ticket": ticket(req, resp, conn, userId);       break;
                case "finish": finish(req, resp, conn, userId);       break;
                case "cancel": cancel(req, resp, conn, userId);       break;
                default:       resp.setStatus(400);
            }

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    private static Integer idParam(HttpServletRequest req) {
        try {
            return Integer.valueOf(req.getParameter("id"));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** student asks for a session */
    private void create(HttpServletRequest req, HttpServletResponse resp, Connection conn,
                        int userId, String role) throws IOException, SQLException {

        if (!"student".equals(role)) { resp.setStatus(403); return; }

        String subject = req.getParameter("subject");
        String topic = req.getParameter("topic");
        String schedule = req.getParameter("schedule");

        if (subject == null || topic == null || schedule == null
                || subject.trim().isEmpty() || topic.trim().isEmpty()
                || subject.length() > 40 || topic.length() > 150) {
            resp.setStatus(400);
            return;
        }

        Timestamp when;
        try {
            // the browser's datetime-local box sends e.g. 2026-10-15T14:30
            when = Timestamp.valueOf(LocalDateTime.parse(schedule.trim()));
        } catch (DateTimeParseException e) {
            resp.setStatus(400);
            return;
        }

        // a random, unguessable room name (stays on the server)
        String room = UUID.randomUUID().toString().replace("-", "");

        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO virtual_requests (student_id, subject, topic, scheduled_at, room) "
                + "VALUES (?, ?, ?, ?, ?)")) {
            ps.setInt(1, userId);
            ps.setString(2, subject.trim());
            ps.setString(3, topic.trim());
            ps.setTimestamp(4, when);
            ps.setString(5, room);
            ps.executeUpdate();
        }
        resp.setStatus(200);
    }

    /** organization member takes a request */
    private void join(HttpServletRequest req, HttpServletResponse resp, Connection conn,
                      int userId, String role) throws IOException, SQLException {

        if (!"organization".equals(role)) { resp.setStatus(403); return; }
        Integer id = idParam(req);
        if (id == null) { resp.setStatus(400); return; }

        // "AND status = 'waiting'" makes this atomic: if two members click at the same
        // moment, the database lets only one UPDATE change a row.
        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE virtual_requests SET status = 'active', helper_id = ?, joined_at = NOW() "
                + "WHERE id = ? AND status = 'waiting'")) {
            ps.setInt(1, userId);
            ps.setInt(2, id);
            ps.executeUpdate();
        }

        // whether we just took it or already had it (rejoining), it must be ours now
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT 1 FROM virtual_requests WHERE id = ? AND status = 'active' AND helper_id = ?")) {
            ps.setInt(1, id);
            ps.setInt(2, userId);
            try (ResultSet rs = ps.executeQuery()) {
                resp.setStatus(rs.next() ? 200 : 409);   // 409: somebody else took it, or it was cancelled
            }
        }
    }

    /** gives the student or the helper of an active session a one-time ticket for the call */
    private void ticket(HttpServletRequest req, HttpServletResponse resp, Connection conn,
                        int userId) throws IOException, SQLException {

        Integer id = idParam(req);
        if (id == null) { resp.setStatus(400); return; }

        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT room FROM virtual_requests "
                + "WHERE id = ? AND status = 'active' AND (student_id = ? OR helper_id = ?)")) {
            ps.setInt(1, id);
            ps.setInt(2, userId);
            ps.setInt(3, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    sendJson(resp, "{\"ticket\":\"" + CallSocket.issueTicket(rs.getString("room")) + "\"}");
                } else {
                    resp.setStatus(404);                  // not your session, or it is not active
                }
            }
        }
    }

    /** the student or the helper ends an active session */
    private void finish(HttpServletRequest req, HttpServletResponse resp, Connection conn,
                        int userId) throws IOException, SQLException {

        Integer id = idParam(req);
        if (id == null) { resp.setStatus(400); return; }

        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE virtual_requests SET status = 'done' "
                + "WHERE id = ? AND status = 'active' AND (student_id = ? OR helper_id = ?)")) {
            ps.setInt(1, id);
            ps.setInt(2, userId);
            ps.setInt(3, userId);
            resp.setStatus(ps.executeUpdate() > 0 ? 200 : 404);
        }
    }

    /** the student withdraws a request that nobody has joined yet */
    private void cancel(HttpServletRequest req, HttpServletResponse resp, Connection conn,
                        int userId) throws IOException, SQLException {

        Integer id = idParam(req);
        if (id == null) { resp.setStatus(400); return; }

        try (PreparedStatement ps = conn.prepareStatement(
                "UPDATE virtual_requests SET status = 'cancelled' "
                + "WHERE id = ? AND student_id = ? AND status = 'waiting'")) {
            ps.setInt(1, id);
            ps.setInt(2, userId);
            resp.setStatus(ps.executeUpdate() > 0 ? 200 : 404);
        }
    }
}