package com.mycompany.obligeu;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;

/**
 * GET /feedback-file?type=post|comment&id=N -> the file or picture attached to a
 * feedback post or comment (any signed-in user). Pictures are shown in the page,
 * everything else is downloaded.
 */
@WebServlet("/feedback-file")
public class FeedbackFileServlet extends HttpServlet {

    static final List<String> IMAGES = Arrays.asList("png", "jpg", "jpeg", "gif", "webp");
    static final List<String> ALLOWED = Arrays.asList(
            "png", "jpg", "jpeg", "gif", "webp", "pdf", "ppt", "pptx", "doc", "docx");

    static String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
    }

    // we choose the type ourselves from the extension, never from what the uploader claimed
    static String contentType(String name) {
        switch (extensionOf(name)) {
            case "png":  return "image/png";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "gif":  return "image/gif";
            case "webp": return "image/webp";
            case "pdf":  return "application/pdf";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "ppt":  return "application/vnd.ms-powerpoint";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "doc":  return "application/msword";
            default:     return "application/octet-stream";
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        if (Web.signedInUserId(req) == null) { resp.setStatus(401); return; }

        int id;
        try {
            id = Integer.parseInt(req.getParameter("id"));
        } catch (NumberFormatException e) {
            resp.setStatus(400);
            return;
        }

        // the table name comes from this fixed choice, never from the request text
        String type = req.getParameter("type");
        String table = "post".equals(type) ? "feedback_posts"
                     : "comment".equals(type) ? "feedback_comments" : null;
        if (table == null) { resp.setStatus(400); return; }

        String fileName = null;
        String storedName = null;
        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT file_name, stored_name FROM " + table + " WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    fileName = rs.getString("file_name");
                    storedName = rs.getString("stored_name");
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
            return;
        }

        if (storedName == null) { resp.setStatus(404); return; }

        Path file = Web.uploadDir().resolve(storedName);
        if (!Files.isRegularFile(file)) { resp.setStatus(404); return; }

        boolean image = IMAGES.contains(extensionOf(fileName));
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        resp.setContentType(contentType(fileName));
        resp.setContentLengthLong(Files.size(file));
        // "inline" shows a picture inside the page; "attachment" makes the browser download
        resp.setHeader("Content-Disposition",
                (image ? "inline" : "attachment") + "; filename*=UTF-8''" + encoded);
        resp.setHeader("X-Content-Type-Options", "nosniff");   // browser must trust our type
        resp.setHeader("Cache-Control", "private, no-store");
        Files.copy(file, resp.getOutputStream());
    }
}

