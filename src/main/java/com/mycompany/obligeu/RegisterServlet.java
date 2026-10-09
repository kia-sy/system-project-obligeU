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
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import org.mindrot.jbcrypt.BCrypt;

@WebServlet("/register")
public class RegisterServlet extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        String firstName = req.getParameter("firstName");
        String lastName = req.getParameter("lastName");
        String email = req.getParameter("email");
        String password = req.getParameter("password");

        if (firstName == null || lastName == null || email == null || password == null
                || firstName.trim().isEmpty() || lastName.trim().isEmpty()
                || !email.contains("@") || password.length() < 8) {
            resp.setStatus(400);
            return;
        }

        firstName = firstName.trim();
        lastName = lastName.trim();
        email = email.trim().toLowerCase();
        String hash = BCrypt.hashpw(password, BCrypt.gensalt());

        try (Connection conn = db.get();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO users (firstName, lastName, email, password_hash) VALUES (?, ?, ?, ?)",
                     Statement.RETURN_GENERATED_KEYS)) {

            ps.setString(1, firstName);
            ps.setString(2, lastName);
            ps.setString(3, email);
            ps.setString(4, hash);
            ps.executeUpdate();

            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) {
                    req.getSession().setAttribute("userId", keys.getInt(1));
                }
            }
            resp.setStatus(200);

        } catch (SQLIntegrityConstraintViolationException e) {
            resp.setStatus(409);
        } catch (SQLException e) {
            e.printStackTrace();
            resp.setStatus(500);
        }
    }
}