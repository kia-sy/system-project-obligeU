package com.mycompany.obligeu;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * GET    /feedback                    -> all posts with their comments (any signed-in user)
 * POST   /feedback  body=..           -> new post (students only)
 * POST   /feedback  postId=N&body=..  -> comment (any signed-in user with a role)
 *        Either POST may also carry one picture/file in a form field called "file".
 * DELETE /feedback?type=comment&id=N  -> organization members (any comment) or the comment's own author
 *                                        type=post is organization members only
 * The attached files are served by FeedbackFileServlet.
 */
@WebServlet("/feedback")
@MultipartConfig(fileSizeThreshold = 1024 * 1024,
                 maxFileSize = 10L * 1024 * 1024,
                 maxRequestSize = 11L * 1024 * 1024)
public class FeedbackServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Integer me = Web.signedInUserId(req);
        if (me == null) { resp.setStatus(401); return; }

        try (Connection conn = db.get()) {

            // comments grouped by post
            Map<Integer, StringBuilder> byPost = new HashMap<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT c.id, c.post_id, c.author_id, c.body, c.created_at, c.file_name, "
                    + "u.firstName, u.lastName, u.role "
                    + "FROM feedback_comments c JOIN users u ON u.student_id = c.author_id "
                    + "ORDER BY c.created_at, c.id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    StringBuilder sb = byPost.computeIfAbsent(rs.getInt("post_id"), k -> new StringBuilder());
                    if (sb.length() > 0) sb.append(",");
                    sb.append("{\"id\":").append(rs.getInt("id"))
                      .append(",\"body\":\"").append(Web.esc(rs.getString("body")))
                      .append("\",\"fileName\":\"").append(Web.esc(rs.getString("file_name")))
                      .append("\",\"author\":\"").append(Web.esc(rs.getString("firstName") + " " + rs.getString("lastName")))
                      .append("\",\"role\":\"").append(Web.esc(rs.getString("role")))
                      .append("\",\"createdAt\":\"").append(Web.esc(rs.getTimestamp("created_at").toString()))
                      .append("\",\"mine\":").append(rs.getInt("author_id") == me)
                      .append("}");
                }
            }

            StringBuilder json = new StringBuilder("[");
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT p.id, p.body, p.created_at, p.file_name, u.firstName, u.lastName "
                    + "FROM feedback_posts p JOIN users u ON u.student_id = p.author_id "
                    + "ORDER BY p.created_at DESC, p.id DESC");
                 ResultSet rs = ps.executeQuery()) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) json.append(",");
                    first = false;
                    StringBuilder cs = byPost.get(rs.getInt("id"));
                    json.append("{\"id\":").append(rs.getInt("id"))
                        .append(",\"body\":\"").append(Web.esc(rs.getString("body")))
                        .append("\",\"fileName\":\"").append(Web.esc(rs.getString("file_name")))
                        .append("\",\"author\":\"").append(Web.esc(rs.getString("firstName") + " " + rs.getString("lastName")))
                        .append("\",\"createdAt\":\"").append(Web.esc(rs.getTimestamp("created_at").toString()))
                        .append("\",\"comments\":[").append(cs == null ? "" : cs).append("]}");
                }
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
            throws IOException, ServletException {
        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        req.setCharacterEncoding("UTF-8");   // must come before the first read of any form field

        // 1) the optional file. Read it first: this is where a too-large upload is detected.
        Part filePart = null;
        String contentType = req.getContentType();
        if (contentType != null && contentType.toLowerCase().startsWith("multipart/")) {
            try {
                filePart = req.getPart("file");
            } catch (IllegalStateException e) {
                resp.setStatus(413);         // bigger than maxFileSize
                return;
            }
            if (filePart != null && filePart.getSize() == 0) filePart = null;   // nothing was chosen
        }

        String body = req.getParameter("body");
        String postIdText = req.getParameter("postId");

        // a picture on its own is fine, so the text may be empty when a file is attached
        boolean noText = body == null || body.trim().isEmpty();
        if ((noText && filePart == null) || (body != null && body.length() > 1000)) {
            resp.setStatus(400);
            return;
        }
        String text = noText ? "" : body.trim();

        // 2) check the file's name and type
        String original = null;
        String ext = null;
        if (filePart != null) {
            original = filePart.getSubmittedFileName();
            if (original == null) { resp.setStatus(400); return; }
            original = original.substring(Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\')) + 1);
            ext = FeedbackFileServlet.extensionOf(original);
            if (!FeedbackFileServlet.ALLOWED.contains(ext) || original.length() > 255) {
                resp.setStatus(400);
                return;
            }
        }

        try (Connection conn = db.get()) {
            String role = Web.roleOf(conn, userId);
            if (role == null) { resp.setStatus(403); return; }

            int postId = 0;
            if (postIdText == null) {
                // new feedback request: students only
                if (!"student".equals(role)) { resp.setStatus(403); return; }
            } else {
                try { postId = Integer.parseInt(postIdText); }
                catch (NumberFormatException e) { resp.setStatus(400); return; }
            }

            // 3) save the file to disk under a random name (the user's own name is never used as a path)
            String storedName = null;
            Path target = null;
            if (filePart != null) {
                storedName = UUID.randomUUID() + "." + ext;
                target = Web.uploadDir().resolve(storedName);
                try (InputStream in = filePart.getInputStream()) {
                    Files.copy(in, target);
                }
            }

            // 4) save the row; if that fails, don't leave a file with no database row
            try {
                if (postIdText == null) {
                    try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO feedback_posts (author_id, body, file_name, stored_name) VALUES (?, ?, ?, ?)")) {
                        ps.setInt(1, userId);
                        ps.setString(2, text);
                        ps.setString(3, original);      // both stay NULL when there is no file
                        ps.setString(4, storedName);
                        ps.executeUpdate();
                    }
                } else {
                    try (PreparedStatement ps = conn.prepareStatement(
                            "INSERT INTO feedback_comments (post_id, author_id, body, file_name, stored_name) "
                            + "SELECT id, ?, ?, ?, ? FROM feedback_posts WHERE id = ?")) {
                        ps.setInt(1, userId);
                        ps.setString(2, text);
                        ps.setString(3, original);
                        ps.setString(4, storedName);
                        ps.setInt(5, postId);
                        if (ps.executeUpdate() == 0) {   // the post is gone
                            if (target != null) Files.deleteIfExists(target);
                            resp.setStatus(404);
                            return;
                        }
                    }
                }
            } catch (SQLException e) {
                if (target != null) Files.deleteIfExists(target);
                throw e;
            }
            resp.setStatus(200);

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    /** stored file names of a post (and its comments) or of one comment */
    private static List<String> storedNames(Connection conn, String table, int id) throws SQLException {
        List<String> names = new ArrayList<>();
        String[] queries = "feedback_posts".equals(table)
                ? new String[] {
                    "SELECT stored_name FROM feedback_posts WHERE id = ?",
                    "SELECT stored_name FROM feedback_comments WHERE post_id = ?" }
                : new String[] { "SELECT stored_name FROM feedback_comments WHERE id = ?" };
        for (String sql : queries) {
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        if (rs.getString(1) != null) names.add(rs.getString(1));
                    }
                }
            }
        }
        return names;
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        int id;
        try { id = Integer.parseInt(req.getParameter("id")); }
        catch (NumberFormatException e) { resp.setStatus(400); return; }

        String type = req.getParameter("type");
        String table = "post".equals(type) ? "feedback_posts"
                     : "comment".equals(type) ? "feedback_comments" : null;
        if (table == null) { resp.setStatus(400); return; }

        try (Connection conn = db.get()) {
            String role = Web.roleOf(conn, userId);
            boolean isOrg = "organization".equals(role);

            // students may only delete their own comments (never posts)
            if (!isOrg && !("student".equals(role) && "feedback_comments".equals(table))) {
                resp.setStatus(403);
                return;
            }

            // note the files first: once the rows are gone we can no longer find them
            List<String> files = storedNames(conn, table, id);

            String sql = "DELETE FROM " + table + " WHERE id = ?" + (isOrg ? "" : " AND author_id = ?");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, id);
                if (!isOrg) ps.setInt(2, userId);
                if (ps.executeUpdate() > 0) {
                    // the delete really happened, so remove the files from disk too
                    for (String f : files) Files.deleteIfExists(Web.uploadDir().resolve(f));
                    resp.setStatus(200);
                } else if (isOrg) {
                    resp.setStatus(404);
                } else {
                    // either gone already, or somebody else's comment
                    try (PreparedStatement chk = conn.prepareStatement(
                            "SELECT 1 FROM feedback_comments WHERE id = ?")) {
                        chk.setInt(1, id);
                        try (ResultSet rs = chk.executeQuery()) {
                            resp.setStatus(rs.next() ? 403 : 404);
                        }
                    }
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}