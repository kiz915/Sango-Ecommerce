package com.sangofiora.backend.repository;

import com.sangofiora.backend.model.Enquiry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EnquiryRepository extends JpaRepository<Enquiry, UUID> {

    List<Enquiry> findAllByOrderByCreatedAtDesc();
}
