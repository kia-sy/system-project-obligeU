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
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * POST /help-requests -> a student asks for help; the request is saved and matched
 *                        against the files organization members uploaded
 * GET  /help-requests -> the signed-in student's requests, each with its matching files
 *
 * Matches are worked out every time a request is read, so a file uploaded later
 * also shows up on older requests.
 */
@WebServlet("/help-requests")
public class HelpRequestServlet extends HttpServlet {

    private static final int MAX_MATCHES = 5;

    // words that say nothing about the topic
    private static final Set<String> STOP = new HashSet<>(Arrays.asList(
            "of", "in", "to", "on", "is", "it", "an", "at", "as", "by", "or", "be", "my", "me", "we",
            "do", "if", "so", "no", "up", "am", "us", "he", "the", "and", "for", "with", "how", "what",
            "why", "can", "you", "help", "need", "please", "about", "this", "that", "from", "have", "has",
            "are", "was", "not", "but", "use", "using", "get", "its", "into", "does", "dont", "cant",
            "want", "like", "some", "any", "all", "who", "when", "where", "which", "your", "our", "out",
            "off", "one", "too", "very", "just", "more", "most", "able", "know", "understand", "explain",
            "learn", "learning", "problem", "question", "topic", "concern", "difficulty", "having",
            "stuck", "trouble", "unable", "cannot", "would", "could", "should", "there", "their", "them"));

    private static class Presentation {
        int id;
        String title;
        String subject;
        String keywords;
        String fileName;
    }

    private static class Hit {
        Presentation p;
        int score;
    }

    // ---------- matching ----------

    private static String stem(String w) {
        if (w.length() > 4 && w.endsWith("ies")) return w.substring(0, w.length() - 3) + "y";
        if (w.length() > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.substring(0, w.length() - 1);
        return w;
    }

    private static Set<String> tokens(String text) {
        Set<String> out = new HashSet<>();
        for (String raw : text.toLowerCase().split("[^a-z0-9+#]+")) {
            if (raw.length() < 2 || STOP.contains(raw)) continue;
            out.add(stem(raw));
        }
        return out;
    }

    /**
     * A file matches when one of its keywords (every word of it) appears in the request,
     * or a word of its title does. Keyword hits count 3, title words 1, and the same
     * subject adds 1 (the subject alone is never enough).
     */
    private static List<Presentation> match(String subject, String topic, String description,
                                            List<Presentation> all) {
        Set<String> words = tokens(topic + " " + description);
        List<Hit> hits = new ArrayList<>();

        for (Presentation p : all) {
            int score = 0;
            for (String keyword : p.keywords.split(",")) {
                Set<String> k = tokens(keyword);
                if (!k.isEmpty() && words.containsAll(k)) score += 3;
            }
            for (String t : tokens(p.title)) {
                if (words.contains(t)) score += 1;
            }
            if (score == 0) continue;
            if (p.subject.equalsIgnoreCase(subject)) score += 1;

            Hit h = new Hit();
            h.p = p;
            h.score = score;
            hits.add(h);
        }

        hits.sort((a, b) -> a.score != b.score ? b.score - a.score : b.p.id - a.p.id);

        List<Presentation> result = new ArrayList<>();
        for (int i = 0; i < hits.size() && i < MAX_MATCHES; i++) result.add(hits.get(i).p);
        return result;
    }

    private static List<Presentation> loadPresentations(Connection conn) throws SQLException {
        List<Presentation> all = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, title, subject, keywords, file_name FROM presentations");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Presentation p = new Presentation();
                p.id = rs.getInt("id");
                p.title = rs.getString("title");
                p.subject = rs.getString("subject");
                p.keywords = rs.getString("keywords");
                p.fileName = rs.getString("file_name");
                all.add(p);
            }
        }
        return all;
    }

    // ---------- JSON ----------

    private static void requestJson(StringBuilder json, int id, String subject, String topic,
                                    Timestamp createdAt, List<Presentation> matches) {
        json.append("{\"id\":").append(id)
            .append(",\"subject\":\"").append(Web.esc(subject))
            .append("\",\"topic\":\"").append(Web.esc(topic))
            .append("\",\"createdAt\":\"").append(Web.esc(createdAt.toString()))
            .append("\",\"matches\":[");
        for (int i = 0; i < matches.size(); i++) {
            Presentation p = matches.get(i);
            if (i > 0) json.append(",");
            json.append("{\"id\":").append(p.id)
                .append(",\"title\":\"").append(Web.esc(p.title))
                .append("\",\"subject\":\"").append(Web.esc(p.subject))
                .append("\",\"fileName\":\"").append(Web.esc(p.fileName))
                .append("\"}");
        }
        json.append("]}");
    }

    private static void sendJson(HttpServletResponse resp, String json) throws IOException {
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(json);
    }

    // ---------- endpoints ----------

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        try (Connection conn = db.get()) {

            List<Presentation> all = loadPresentations(conn);
            StringBuilder json = new StringBuilder("[");

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT id, subject, topic, description, created_at FROM help_requests "
                    + "WHERE student_id = ? ORDER BY created_at DESC, id DESC")) {
                ps.setInt(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) json.append(",");
                        first = false;
                        requestJson(json, rs.getInt("id"), rs.getString("subject"), rs.getString("topic"),
                                rs.getTimestamp("created_at"),
                                match(rs.getString("subject"), rs.getString("topic"),
                                      rs.getString("description"), all));
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

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        req.setCharacterEncoding("UTF-8");
        String subject = req.getParameter("subject");
        String topic = req.getParameter("topic");
        String description = req.getParameter("description");

        if (subject == null || topic == null || description == null
                || subject.trim().isEmpty() || topic.trim().isEmpty() || description.trim().isEmpty()
                || subject.length() > 40 || topic.length() > 150 || description.length() > 2000) {
            resp.setStatus(400);
            return;
        }
        subject = subject.trim();
        topic = topic.trim();
        description = description.trim();

        try (Connection conn = db.get()) {

            if (!"student".equals(Web.roleOf(conn, userId))) { resp.setStatus(403); return; }

            Timestamp now = new Timestamp(System.currentTimeMillis());
            int id = 0;

            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO help_requests (student_id, subject, topic, description, created_at) "
                    + "VALUES (?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS)) {
                ps.setInt(1, userId);
                ps.setString(2, subject);
                ps.setString(3, topic);
                ps.setString(4, description);
                ps.setTimestamp(5, now);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    if (keys.next()) id = keys.getInt(1);
                }
            }

            StringBuilder json = new StringBuilder();
            requestJson(json, id, subject, topic, now,
                    match(subject, topic, description, loadPresentations(conn)));
            sendJson(resp, json.toString());

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}