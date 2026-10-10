package com.mycompany.obligeu;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * GET    /announcements        -> any signed-in user can read the news (newest first)
 * POST   /announcements        -> ONLY organization members can post
 * DELETE /announcements?id=N   -> ONLY organization members can delete
 */
@WebServlet("/announcements")
public class AnnouncementServlet extends HttpServlet {

    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"':  sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    private static Integer signedInUserId(HttpServletRequest req) {
        HttpSession session = req.getSession(false);
        if (session == null) return null;
        return (Integer) session.getAttribute("userId");
    }

    // the role is checked on the server, so students cannot post/delete even by calling the URL directly
    private static boolean isOrganization(Connection conn, int userId) throws SQLException {
        try (PreparedStatement check = conn.prepareStatement(
                "SELECT role FROM users WHERE student_id = ?")) {
            check.setInt(1, userId);
            try (ResultSet rs = check.executeQuery()) {
                return rs.next() && "organization".equals(rs.getString("role"));
            }
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        if (signedInUserId(req) == null) {
            resp.setStatus(401);
            return;
        }

        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT a.id, a.title, a.category, a.body, a.created_at, a.event_date, u.firstName, u.lastName "
                     + "FROM announcements a JOIN users u ON u.student_id = a.author_id "
                     + "ORDER BY a.created_at DESC, a.id DESC");
             ResultSet rs = ps.executeQuery()) {

            StringBuilder json = new StringBuilder("[");
            boolean first = true;
            while (rs.next()) {
                if (!first) json.append(",");
                first = false;
                java.sql.Date eventDate = rs.getDate("event_date");
                json.append("{\"id\":").append(rs.getInt("id"))
                    .append(",\"title\":\"").append(esc(rs.getString("title")))
                    .append("\",\"category\":\"").append(esc(rs.getString("category")))
                    .append("\",\"body\":\"").append(esc(rs.getString("body")))
                    .append("\",\"author\":\"").append(esc(rs.getString("firstName") + " " + rs.getString("lastName")))
                    .append("\",\"eventDate\":\"").append(eventDate == null ? "" : eventDate.toString())
                    .append("\",\"createdAt\":\"").append(esc(rs.getTimestamp("created_at").toString()))
                    .append("\"}");
            }
            json.append("]");

            resp.setContentType("application/json");
            resp.setCharacterEncoding("UTF-8");
            resp.setHeader("Cache-Control", "no-store");
            resp.getWriter().write(json.toString());

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        Integer userId = signedInUserId(req);
        if (userId == null) {
            resp.setStatus(401);
            return;
        }

        try (Connection conn = db.get()) {

            if (!isOrganization(conn, userId)) {
                resp.setStatus(403);
                return;
            }

            req.setCharacterEncoding("UTF-8");
            String title = req.getParameter("title");
            String category = req.getParameter("category");
            String body = req.getParameter("body");
            String eventDateText = req.getParameter("eventDate");

            if (title == null || category == null || body == null || eventDateText == null
                    || title.trim().isEmpty() || category.trim().isEmpty() || body.trim().isEmpty()
                    || title.length() > 150 || category.length() > 40) {
                resp.setStatus(400);
                return;
            }

            LocalDate eventDate;
            try {
                eventDate = LocalDate.parse(eventDateText.trim());   // yyyy-MM-dd
            } catch (DateTimeParseException e) {
                resp.setStatus(400);
                return;
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO announcements (title, category, body, author_id, event_date) VALUES (?, ?, ?, ?, ?)")) {
                ps.setString(1, title.trim());
                ps.setString(2, category.trim().toUpperCase());
                ps.setString(3, body.trim());
                ps.setInt(4, userId);
                ps.setDate(5, java.sql.Date.valueOf(eventDate));
                ps.executeUpdate();
            }
            resp.setStatus(200);

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        Integer userId = signedInUserId(req);
        if (userId == null) {
            resp.setStatus(401);
            return;
        }

        int id;
        try {
            id = Integer.parseInt(req.getParameter("id"));
        } catch (NumberFormatException e) {
            resp.setStatus(400);
            return;
        }

        try (Connection conn = db.get()) {

            if (!isOrganization(conn, userId)) {
                resp.setStatus(403);
                return;
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM announcements WHERE id = ?")) {
                ps.setInt(1, id);
                resp.setStatus(ps.executeUpdate() > 0 ? 200 : 404);
            }

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}