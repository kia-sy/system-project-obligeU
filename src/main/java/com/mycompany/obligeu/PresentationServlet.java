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
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * GET    /presentations        -> organization members: list of uploaded files
 * POST   /presentations        -> students AND organization members: upload a file (multipart form)
 * DELETE /presentations?id=N   -> organization members: remove a file
 * Students get files through their help requests.
 */
@WebServlet("/presentations")
@MultipartConfig(fileSizeThreshold = 1024 * 1024,
                 maxFileSize = 25L * 1024 * 1024,
                 maxRequestSize = 26L * 1024 * 1024)
public class PresentationServlet extends HttpServlet {

    private static final List<String> ALLOWED = Arrays.asList("ppt", "pptx", "pdf", "doc", "docx");

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        try (Connection conn = db.get()) {

            if (!"organization".equals(Web.roleOf(conn, userId))) { resp.setStatus(403); return; }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT p.id, p.title, p.subject, p.keywords, p.file_name, p.created_at, u.firstName, u.lastName "
                    + "FROM presentations p JOIN users u ON u.student_id = p.uploader_id "
                    + "ORDER BY p.created_at DESC, p.id DESC");
                 ResultSet rs = ps.executeQuery()) {

                StringBuilder json = new StringBuilder("[");
                boolean first = true;
                while (rs.next()) {
                    if (!first) json.append(",");
                    first = false;
                    json.append("{\"id\":").append(rs.getInt("id"))
                        .append(",\"title\":\"").append(Web.esc(rs.getString("title")))
                        .append("\",\"subject\":\"").append(Web.esc(rs.getString("subject")))
                        .append("\",\"keywords\":\"").append(Web.esc(rs.getString("keywords")))
                        .append("\",\"fileName\":\"").append(Web.esc(rs.getString("file_name")))
                        .append("\",\"uploader\":\"").append(Web.esc(rs.getString("firstName") + " " + rs.getString("lastName")))
                        .append("\",\"createdAt\":\"").append(Web.esc(rs.getTimestamp("created_at").toString()))
                        .append("\"}");
                }
                json.append("]");

                resp.setContentType("application/json");
                resp.setCharacterEncoding("UTF-8");
                resp.setHeader("Cache-Control", "no-store");
                resp.getWriter().write(json.toString());
            }

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

        req.setCharacterEncoding("UTF-8");

        // read the file first: this is where a too-large upload is detected
        Part filePart;
        try {
            filePart = req.getPart("file");
        } catch (IllegalStateException e) {
            resp.setStatus(413);
            return;
        }

        String title = req.getParameter("title");
        String subject = req.getParameter("subject");
        String keywords = req.getParameter("keywords");

        if (filePart == null || filePart.getSize() == 0
                || title == null || subject == null || keywords == null
                || title.trim().isEmpty() || subject.trim().isEmpty()
                || title.length() > 150 || subject.length() > 40) {
            resp.setStatus(400);
            return;
        }

        // keywords: lower-case, comma separated, no empty entries
        StringBuilder cleaned = new StringBuilder();
        for (String k : keywords.split(",")) {
            k = k.trim().toLowerCase();
            if (k.isEmpty()) continue;
            if (cleaned.length() > 0) cleaned.append(", ");
            cleaned.append(k);
        }
        if (cleaned.length() == 0 || cleaned.length() > 255) {
            resp.setStatus(400);
            return;
        }

        // original file name (strip any folder part) and allowed type
        String original = filePart.getSubmittedFileName();
        if (original == null) { resp.setStatus(400); return; }
        original = original.substring(Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\')) + 1);
        int dot = original.lastIndexOf('.');
        String ext = dot < 0 ? "" : original.substring(dot + 1).toLowerCase();
        if (!ALLOWED.contains(ext) || original.length() > 255) {
            resp.setStatus(400);
            return;
        }

        try (Connection conn = db.get()) {

            String role = Web.roleOf(conn, userId);
            if (!"organization".equals(role) && !"student".equals(role)) { resp.setStatus(403); return; }

            String storedName = UUID.randomUUID() + "." + ext;
            Path target = Web.uploadDir().resolve(storedName);
            try (InputStream in = filePart.getInputStream()) {
                Files.copy(in, target);
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO presentations (title, subject, keywords, file_name, stored_name, uploader_id) "
                    + "VALUES (?, ?, ?, ?, ?, ?)")) {
                ps.setString(1, title.trim());
                ps.setString(2, subject.trim());
                ps.setString(3, cleaned.toString());
                ps.setString(4, original);
                ps.setString(5, storedName);
                ps.setInt(6, userId);
                ps.executeUpdate();
            } catch (SQLException e) {
                Files.deleteIfExists(target);   // don't leave a file with no database row
                throw e;
            }
            resp.setStatus(200);

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        Integer userId = Web.signedInUserId(req);
        if (userId == null) { resp.setStatus(401); return; }

        int id;
        try {
            id = Integer.parseInt(req.getParameter("id"));
        } catch (NumberFormatException e) {
            resp.setStatus(400);
            return;
        }

        try (Connection conn = db.get()) {

            if (!"organization".equals(Web.roleOf(conn, userId))) { resp.setStatus(403); return; }

            String storedName = null;
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT stored_name FROM presentations WHERE id = ?")) {
                ps.setInt(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) storedName = rs.getString("stored_name");
                }
            }
            if (storedName == null) { resp.setStatus(404); return; }

            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM presentations WHERE id = ?")) {
                ps.setInt(1, id);
                ps.executeUpdate();
            }
            Files.deleteIfExists(Web.uploadDir().resolve(storedName));
            resp.setStatus(200);

        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}