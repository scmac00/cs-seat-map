// Seat Map Application - Refactored to align with Salesforce LWC patterns
// This implementation uses a more structured approach similar to LWC
// while maintaining compatibility with vanilla HTML/JS

// Create a single source of truth for pillar locations
const PILLAR_LOCATIONS = [
  { row: "E", start: 40, end: 41 }, // Pillar in row E spanning seats 40-41
  { row: "E", start: 56, end: 57 }, // Pillar in row E spanning seats 56-57
  { row: "E", start: 74, end: 75 }, // Pillar in row E spanning seats 74-75
  { row: "E", start: 92, end: 95 }, // Pillar in row E spanning seats 92-95
];

// Utility functions
const Logger = {
  isDebug: true, // Set to false in production

  log(message, data) {
    if (this.isDebug) {
      console.log(`[SeatMap] ${message}`, data || "");
    }
  },

  error(message, error) {
    console.error(`[SeatMap] ${message}`, error || "");
  },
};

// Debounce function to prevent excessive re-rendering
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

document.addEventListener("DOMContentLoaded", function () {
  // ===== DATA TRANSFORMATION MODULE =====
  // This mimics the formatSeatData method in the LWC component
  const DataService = {
    // Cache for processed data
    dataCache: new Map(),

    // Transform flat Salesforce data into hierarchical structure
    // similar to the LWC implementation
    transformSalesforceData(rawData) {
      if (!Array.isArray(rawData)) {
        Logger.error("Invalid data format: Expected an array");
        return [];
      }

      try {
        // Use Map for better performance
        const rowMap = new Map();

        rawData.forEach((seat) => {
          // Validate required fields
          if (
            !seat["PricebookEntry.Product2.Row"] ||
            !seat["PricebookEntry.Product2.Seat_Number"]
          ) {
            Logger.warn(
              "Skipping record with missing required fields:",
              seat.Id
            );
            return;
          }

          const row = seat["PricebookEntry.Product2.Row"];
          const accountName = seat.Opportunity_Account_Name;
          const opportunityId = seat["Opportunity.Id"] || "";

          if (!rowMap.has(row)) {
            rowMap.set(row, {
              rowLabel: row,
              accountName: accountName,
              seats: [],
            });
          }

          rowMap.get(row).seats.push({
            seatNumber: parseInt(
              parseFloat(seat["PricebookEntry.Product2.Seat_Number"])
            ),
            day: seat["PricebookEntry.Product2.Day_of_Stampede"],
            event: seat["PricebookEntry.Product2.Event_Type"],
            recordId: seat.Id,
            opportunityId: opportunityId,
            accountName: accountName,
          });
        });

        return Array.from(rowMap.values());
      } catch (error) {
        Logger.error("Error processing seat data:", error);
        return [];
      }
    },

    // Find contiguous segments in an array of numbers, accounting for pillars
    findContiguousSegments(numbers) {
      if (numbers.length === 0) return [];

      // Sort the numbers
      numbers.sort((a, b) => a - b);

      // Helper function to check if a gap is due to a pillar
      const isPillarGap = (prev, current) => {
        for (const pillar of PILLAR_LOCATIONS) {
          // Check if the gap exactly matches a pillar's span
          if (prev + 1 === pillar.start && current === pillar.end + 1) {
            return true;
          }
        }
        return false;
      };

      const segments = [];
      let currentSegment = [numbers[0]];

      for (let i = 1; i < numbers.length; i++) {
        if (
          numbers[i] === numbers[i - 1] + 1 ||
          isPillarGap(numbers[i - 1], numbers[i])
        ) {
          // Continue the current segment if consecutive or spans a known pillar
          currentSegment.push(numbers[i]);
        } else {
          // End the current segment and start a new one
          segments.push([...currentSegment]);
          currentSegment = [numbers[i]];
        }
      }

      // Add the last segment
      segments.push(currentSegment);

      return segments;
    },

    // Get cached processed data or process it if not cached
    getCachedProcessedData(day, event, data) {
      const cacheKey = `${day}|${event}`;

      if (this.dataCache.has(cacheKey)) {
        Logger.log("Using cached data for", cacheKey);
        return this.dataCache.get(cacheKey);
      }

      Logger.log("Processing data for", cacheKey);
      const processedData = this.processConnectedSeats(data);
      this.dataCache.set(cacheKey, processedData);

      return processedData;
    },

    // Process data to identify connected seats
    // This moves the connected seats logic from UI to data layer
    processConnectedSeats(data) {
      const processedData = [];

      data.forEach((row) => {
        // Group seats by opportunity ID to find connected seats
        const seatsByOpportunity = {};

        row.seats.forEach((seat) => {
          const key = seat.opportunityId || `single-${seat.recordId}`;
          if (!seatsByOpportunity[key]) {
            seatsByOpportunity[key] = [];
          }
          seatsByOpportunity[key].push(seat);
        });

        // Process each opportunity group
        const processedRow = {
          rowLabel: row.rowLabel,
          seatGroups: [],
        };

        Object.values(seatsByOpportunity).forEach((opportunitySeats) => {
          // Sort seats by number
          opportunitySeats.sort((a, b) => a.seatNumber - b.seatNumber);

          // Find contiguous segments
          const seatNumbers = opportunitySeats.map((s) => s.seatNumber);
          const segments = this.findContiguousSegments(seatNumbers);

          // Create seat groups for each segment
          segments.forEach((segment) => {
            const segmentSeats = opportunitySeats.filter((s) =>
              segment.includes(s.seatNumber)
            );

            const isConnected = segment.length > 1;
            const firstSeat = segmentSeats[0];

            processedRow.seatGroups.push({
              isConnected: isConnected,
              startSeat: segment[0],
              endSeat: segment[segment.length - 1],
              seatCount: segment.length,
              seats: segmentSeats,
              accountName: firstSeat.accountName,
              day: firstSeat.day,
              event: firstSeat.event,
              opportunityId: firstSeat.opportunityId,
              recordIds: segmentSeats.map((s) => s.recordId),
            });
          });
        });

        processedData.push(processedRow);
      });

      return processedData;
    },
  };

  // ===== STATE MANAGEMENT MODULE =====
  // This mimics the reactive state management in LWC
  const AppState = {
    // Raw data
    seatData: [],

    // Filtered data for display (similar to filteredSeatData in LWC)
    filteredSeatData: [],

    // Processed data with connected seats
    processedData: [],

    // Filter state
    selectedDay: "",
    selectedEvent: "",

    // Selected seat
    selectedSeat: null,

    // Observers for reactive updates
    observers: [],

    // Initialize the state with data
    initialize(rawData) {
      try {
        // Show loading indicator
        this.showLoadingIndicator();

        // Transform the raw data into the hierarchical structure
        this.seatData = DataService.transformSalesforceData(rawData);

        // Set initial filters based on available data
        const filterOptions = this.initializeFilters();

        // Apply initial filters
        this.applyFilters();

        // Hide loading indicator
        this.hideLoadingIndicator();

        return filterOptions;
      } catch (error) {
        Logger.error("Error initializing application:", error);
        this.hideLoadingIndicator();
        this.showErrorMessage(
          "Failed to initialize the seating chart. Please refresh the page."
        );
        return { days: [], events: [] };
      }
    },

    // Show loading indicator
    showLoadingIndicator() {
      let loadingEl = document.querySelector(".loading-indicator");
      if (!loadingEl) {
        loadingEl = document.createElement("div");
        loadingEl.className = "loading-indicator";
        loadingEl.textContent = "Loading seat data...";
        document.body.appendChild(loadingEl);
      }
      loadingEl.style.display = "block";
    },

    // Hide loading indicator
    hideLoadingIndicator() {
      const loadingEl = document.querySelector(".loading-indicator");
      if (loadingEl) {
        loadingEl.style.display = "none";
      }
    },

    // Show error message
    showErrorMessage(message) {
      const errorEl = document.createElement("div");
      errorEl.className = "error-message";
      errorEl.textContent = message;

      // Find a good place to show the error
      const container =
        document.querySelector(".seating-container") || document.body;
      container.prepend(errorEl);
    },

    // Initialize filters with first available options
    initializeFilters() {
      // Get unique days from the data
      const days = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          days.add(seat.day);
        });
      });

      // Sort days by day number
      const sortedDays = [...days].sort((a, b) => {
        const dayNumA = parseInt(a.split(" ")[1]);
        const dayNumB = parseInt(b.split(" ")[1]);
        return dayNumA - dayNumB;
      });

      // Get unique event types
      const events = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          events.add(seat.event);
        });
      });

      // Sort event types alphabetically
      const sortedEvents = [...events].sort();

      // Set default values
      this.selectedDay = sortedDays.length > 0 ? sortedDays[0] : "";
      // Set "Rodeo" as the default event type if available, otherwise use the first event type
      this.selectedEvent = sortedEvents.includes("Rodeo")
        ? "Rodeo"
        : sortedEvents.length > 0
        ? sortedEvents[0]
        : "";

      // Return the options for UI creation
      return {
        days: sortedDays,
        events: sortedEvents,
      };
    },

    // Apply filters to the data (similar to applyFilters in LWC)
    applyFilters() {
      Logger.log("Applying filters:", {
        day: this.selectedDay,
        event: this.selectedEvent,
      });

      // Use the LWC-style filtering approach
      this.filteredSeatData = this.seatData
        .map((row) => {
          // Filter seats based on selected day and event
          const filteredSeats = row.seats.filter((seat) => {
            const dayMatch = !this.selectedDay || seat.day === this.selectedDay;
            const eventMatch =
              !this.selectedEvent || seat.event === this.selectedEvent;
            return dayMatch && eventMatch;
          });

          // Return a new row object with filtered seats
          return {
            ...row,
            seats: filteredSeats,
          };
        })
        .filter((row) => row.seats.length > 0); // Remove empty rows

      Logger.log("Filtered data:", this.filteredSeatData);

      // Process connected seats with caching
      this.processedData = DataService.getCachedProcessedData(
        this.selectedDay,
        this.selectedEvent,
        this.filteredSeatData
      );

      Logger.log("Processed data:", this.processedData);

      // Clear selected seat when filters change
      this.selectedSeat = null;

      // Notify observers of state change
      this.notifyObservers();
    },

    // Set day filter with debouncing
    setDay: debounce(function (day) {
      this.selectedDay = day;
      this.applyFilters();
    }, 100),

    // Set event filter with debouncing
    setEvent: debounce(function (event) {
      this.selectedEvent = event;
      this.applyFilters();
    }, 100),

    // Set selected seat
    selectSeat(seat) {
      this.selectedSeat = seat;
      this.notifyObservers();
    },

    // Add observer for reactive updates
    addObserver(callback) {
      this.observers.push(callback);
    },

    // Notify all observers of state change
    notifyObservers() {
      this.observers.forEach((callback) => callback(this));
    },

    // Get all unique days
    getDays() {
      const days = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          days.add(seat.day);
        });
      });

      return [...days].sort((a, b) => {
        const dayNumA = parseInt(a.split(" ")[1]);
        const dayNumB = parseInt(b.split(" ")[1]);
        return dayNumA - dayNumB;
      });
    },

    // Get all unique event types
    getEvents() {
      const events = new Set();
      this.seatData.forEach((row) => {
        row.seats.forEach((seat) => {
          events.add(seat.event);
        });
      });

      return [...events].sort();
    },
  };

  // ===== UI RENDERING MODULE =====
  // This handles all DOM manipulation
  const UI = {
    // Initialize the UI
    initialize() {
      this.initializeFilters();
      this.createSeatDetailPanel();
      this.updateSeatingMap();
      this.setupEventDelegation();
    },

    // Get actual seats excluding pillars
    getActualSeats(row, startSeat, endSeat) {
      // Create array of all seats in range
      const allSeats = [];
      for (let i = parseInt(startSeat); i <= parseInt(endSeat); i++) {
        allSeats.push(i);
      }

      // Filter out seats that are part of pillars
      return allSeats.filter((seatNum) => {
        for (const pillar of PILLAR_LOCATIONS) {
          if (
            row === pillar.row &&
            seatNum >= pillar.start &&
            seatNum <= pillar.end
          ) {
            return false; // Exclude pillar seats
          }
        }
        return true; // Include non-pillar seats
      });
    },

    // Format seat ranges for display (e.g., "38-39, 42-43" instead of "38-43")
    formatSeatRanges(seats) {
      if (seats.length === 0) return "";

      // Sort seats
      seats.sort((a, b) => a - b);

      const ranges = [];
      let rangeStart = seats[0];
      let rangeEnd = seats[0];

      for (let i = 1; i < seats.length; i++) {
        if (seats[i] === rangeEnd + 1) {
          // Continue current range
          rangeEnd = seats[i];
        } else {
          // End current range and start a new one
          ranges.push(
            rangeStart === rangeEnd
              ? `${rangeStart}`
              : `${rangeStart}-${rangeEnd}`
          );
          rangeStart = seats[i];
          rangeEnd = seats[i];
        }
      }

      // Add the last range
      ranges.push(
        rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`
      );

      return ranges.join(", ");
    },

    // Setup event delegation for seat clicks
    setupEventDelegation() {
      // Add a single event listener to the parent container
      const seatingContainer = document.querySelector(".venue-layout");
      if (!seatingContainer) return;

      seatingContainer.addEventListener("click", (event) => {
        // Check if a seat or connected seats group was clicked
        const seat = event.target.closest(".seat.sold, .connected-seats");
        if (!seat) return;

        // Remove active class from all seats
        document
          .querySelectorAll(".seat.active, .connected-seats.active")
          .forEach((s) => s.classList.remove("active"));

        // Add active class to clicked element
        seat.classList.add("active");

        if (seat.classList.contains("connected-seats")) {
          // Handle connected seats click
          const opportunityId = seat.getAttribute("data-opportunity-id");
          const accountName = seat.getAttribute("data-account");
          const row = seat.getAttribute("data-row");
          const day = seat.getAttribute("data-day");
          const eventType = seat.getAttribute("data-event-type");

          // Find all connected elements with the same opportunity ID in the same row
          const relatedElements = document.querySelectorAll(
            `.connected-seats[data-opportunity-id="${opportunityId}"][data-row="${row}"][data-day="${day}"][data-event-type="${eventType}"]`
          );

          // If there are multiple segments for the same booking (spanning across stairway or section)
          if (relatedElements.length > 1) {
            // Highlight all related segments
            relatedElements.forEach((el) => {
              el.classList.add("active");
            });

            // Find min and max seat numbers across all segments
            let minSeat = Infinity;
            let maxSeat = -Infinity;
            let allSeatNumbers = [];

            relatedElements.forEach((el) => {
              const segmentStart = parseInt(
                el.getAttribute("data-original-start") ||
                  el.getAttribute("data-start-seat")
              );
              const segmentEnd = parseInt(
                el.getAttribute("data-original-end") ||
                  el.getAttribute("data-end-seat")
              );

              // Update min and max seats
              minSeat = Math.min(minSeat, segmentStart);
              maxSeat = Math.max(maxSeat, segmentEnd);

              // Get actual seats for this segment (excluding pillars)
              const segmentSeats = this.getActualSeats(
                row,
                segmentStart,
                segmentEnd
              );
              allSeatNumbers.push(...segmentSeats);
            });

            // Sort and deduplicate seat numbers
            allSeatNumbers = [...new Set(allSeatNumbers)].sort((a, b) => a - b);

            // Set selected seat to represent the entire booking across all segments
            AppState.selectSeat({
              isConnected: true,
              accountName: accountName,
              row: row,
              startSeat: minSeat,
              endSeat: maxSeat,
              seatCount: allSeatNumbers.length,
              day: day,
              eventType: eventType,
              opportunityId: opportunityId,
              status: "sold",
              isMultiSegment: true,
              allSeatNumbers: allSeatNumbers,
            });
          } else {
            // Single segment case (original behavior)
            // If this is part of a split group, use the original group data
            const startSeat =
              seat.getAttribute("data-original-start") ||
              seat.getAttribute("data-start-seat");
            const endSeat =
              seat.getAttribute("data-original-end") ||
              seat.getAttribute("data-end-seat");

            // Calculate actual seats excluding pillars
            const actualSeats = this.getActualSeats(row, startSeat, endSeat);
            const actualSeatCount = actualSeats.length;

            // Set selected seat to this connected segment
            AppState.selectSeat({
              isConnected: true,
              accountName: accountName,
              row: row,
              startSeat: startSeat,
              endSeat: endSeat,
              seatCount: actualSeatCount, // Use actual seat count excluding pillars
              day: day,
              eventType: eventType,
              opportunityId: opportunityId,
              status: "sold",
            });
          }
        } else {
          // Handle individual seat click
          const seatId = seat.getAttribute("data-seat-id");
          const row = seatId.charAt(0);
          const seatNumber = seatId.slice(1);

          AppState.selectSeat({
            seatId: seatId,
            row: row,
            seatNumber: seatNumber,
            account: seat.getAttribute("data-account"),
            eventType: seat.getAttribute("data-event-type"),
            day: seat.getAttribute("data-day"),
            sfId: seat.getAttribute("data-sf-id"),
            opportunityId: seat.getAttribute("data-opportunity-id") || "",
            status: "sold",
          });
        }
      });
    },

    // Initialize filter controls that are already in the HTML
    initializeFilters() {
      // Set initial values for filters based on state
      const dayFilterSelect = document.getElementById("day-filter");
      dayFilterSelect.value = AppState.selectedDay;

      const eventTypeRadios = document.querySelectorAll(
        'input[name="event-type"]'
      );
      for (const radio of eventTypeRadios) {
        if (radio.value === AppState.selectedEvent) {
          radio.checked = true;
        }
      }

      // Add event listeners
      dayFilterSelect.addEventListener("change", function () {
        AppState.setDay(this.value);
      });

      eventTypeRadios.forEach((radio) => {
        radio.addEventListener("change", function () {
          if (this.checked) {
            Logger.log("Radio button changed to:", this.value);
            AppState.setEvent(this.value);
          }
        });
      });
    },

    // Create seat detail panel
    createSeatDetailPanel() {
      const detailPanel = document.createElement("div");
      detailPanel.className = "seat-detail-panel";
      detailPanel.id = "seat-detail-panel";
      detailPanel.innerHTML =
        '<h3>Seat Details</h3><div id="seat-detail-content"></div>';

      // Add to main section, after the seating-container
      const seatingContainer = document.querySelector(".seating-container");
      seatingContainer.parentNode.insertBefore(
        detailPanel,
        seatingContainer.nextSibling
      );
    },

    // Update the seating map with data using requestAnimationFrame for better performance
    updateSeatingMap() {
      Logger.log(
        "Updating seating map with processed data:",
        AppState.processedData
      );

      // Batch DOM operations for better performance
      requestAnimationFrame(() => {
        // Reset previously marked seats
        document
          .querySelectorAll(".seat.sold, .connected-seats")
          .forEach((seat) => {
            if (seat.classList.contains("connected-seats")) {
              // If this is a connected seats element, replace it with the original seats
              const row = seat.getAttribute("data-row");
              const startSeat = parseInt(seat.getAttribute("data-start-seat"));
              const endSeat = parseInt(seat.getAttribute("data-end-seat"));

              // Recreate the individual seats
              const seatElements = [];
              for (let i = startSeat; i <= endSeat; i++) {
                const seatElement = document.createElement("div");
                seatElement.className = "seat";
                seatElement.setAttribute("data-seat-id", `${row}${i}`);
                seatElement.textContent = i;
                seatElements.push(seatElement);
              }

              // Replace the connected seats with the original seats
              const parent = seat.parentNode;
              seatElements.forEach((seatEl) => {
                parent.insertBefore(seatEl, seat);
              });
              seat.remove();
            } else {
              // Just a regular sold seat, reset it
              seat.classList.remove("sold");
              seat.removeAttribute("data-sf-id");
              seat.removeAttribute("data-account");
              seat.removeAttribute("data-event-type");
              seat.removeAttribute("data-day");
              seat.removeAttribute("data-opportunity-id");
            }
          });

        // Process each row and its seat groups
        if (AppState.processedData && AppState.processedData.length > 0) {
          AppState.processedData.forEach((row) => {
            if (row.seatGroups && row.seatGroups.length > 0) {
              row.seatGroups.forEach((group) => {
                if (group.isConnected) {
                  // Handle connected seats
                  this.renderConnectedSeats(row.rowLabel, group);
                } else {
                  // Handle individual seat
                  this.renderSingleSeat(row.rowLabel, group);
                }
              });
            }
          });
        }

        // Update seat details if a seat is selected
        if (AppState.selectedSeat) {
          this.updateSeatDetails();
        }
      });
    },

    // Render connected seats
    renderConnectedSeats(rowLabel, group) {
      // Check if the group spans across sections by looking for missing seats
      // This will detect staircases and section breaks
      const seatSegments = this.findSeatSegments(
        rowLabel,
        group.startSeat,
        group.endSeat
      );

      if (seatSegments.length === 0) {
        return; // No valid segments found
      }

      // Process each segment separately
      seatSegments.forEach((segment) => {
        const firstSeatId = `${rowLabel}${segment.start}`;
        const firstSeat = document.querySelector(
          `[data-seat-id="${firstSeatId}"]`
        );

        if (firstSeat) {
          // Remove all seats in the segment except the first
          for (let i = segment.start + 1; i <= segment.end; i++) {
            const seatId = `${rowLabel}${i}`;
            const seatEl = document.querySelector(`[data-seat-id="${seatId}"]`);
            if (seatEl) {
              seatEl.remove();
            }
          }

          // Create the connected seats element
          const connectedElement = document.createElement("div");
          connectedElement.className = "connected-seats";
          connectedElement.setAttribute("data-row", rowLabel);
          connectedElement.setAttribute("data-start-seat", segment.start);
          connectedElement.setAttribute("data-end-seat", segment.end);
          connectedElement.setAttribute("data-account", group.accountName);
          connectedElement.setAttribute("data-day", group.day);
          connectedElement.setAttribute("data-event-type", group.event);
          connectedElement.setAttribute(
            "data-opportunity-id",
            group.opportunityId || ""
          );

          // For segments that are part of a split group, add a special attribute
          if (seatSegments.length > 1) {
            connectedElement.setAttribute("data-split-group", "true");
            connectedElement.setAttribute(
              "data-original-start",
              group.startSeat
            );
            connectedElement.setAttribute("data-original-end", group.endSeat);
            connectedElement.setAttribute(
              "title",
              `${group.accountName} (Part of ${group.startSeat}-${group.endSeat})`
            );
          } else {
            connectedElement.setAttribute(
              "title",
              `${group.accountName} (${segment.start}-${segment.end})`
            );
          }

          // Add the account name
          const nameElement = document.createElement("div");
          nameElement.className = "account-name";
          nameElement.textContent = group.accountName;
          connectedElement.appendChild(nameElement);

          // Set the grid column span
          const seatSpan = segment.end - segment.start + 1;
          connectedElement.style.gridColumn = `span ${seatSpan}`;

          // Replace the first seat with the connected element
          firstSeat.parentNode.replaceChild(connectedElement, firstSeat);
        }
      });
    },

    // Find valid seat segments that don't cross staircases or pillars
    findSeatSegments(rowLabel, startSeat, endSeat) {
      const segments = [];

      // First, collect all existing seats in the range with their parent sections
      const existingSeats = [];
      for (let i = startSeat; i <= endSeat; i++) {
        const seatId = `${rowLabel}${i}`;
        const seatEl = document.querySelector(`[data-seat-id="${seatId}"]`);

        if (seatEl) {
          // Find the parent section of this seat
          let parentSection = seatEl.closest(".seat-section");

          existingSeats.push({
            seatNumber: i,
            element: seatEl,
            section: parentSection,
          });
        }
      }

      // Group seats by their parent section
      const seatsBySection = {};
      existingSeats.forEach((seat) => {
        const sectionId = seat.section
          ? seat.section.getAttribute("data-section-id") ||
            Array.from(seat.section.parentNode.children).indexOf(seat.section)
          : "unknown";

        if (!seatsBySection[sectionId]) {
          seatsBySection[sectionId] = [];
        }
        seatsBySection[sectionId].push(seat);
      });

      // Create segments for each section, ensuring seats in different sections are separate
      Object.values(seatsBySection).forEach((sectionSeats) => {
        if (sectionSeats.length === 0) return;

        // Sort seats by number within each section
        sectionSeats.sort((a, b) => a.seatNumber - b.seatNumber);

        let currentSegment = null;

        // Create segments of consecutive seats within this section
        sectionSeats.forEach((seat) => {
          if (!currentSegment) {
            currentSegment = { start: seat.seatNumber, end: seat.seatNumber };
          } else if (seat.seatNumber === currentSegment.end + 1) {
            // Extend current segment if seats are consecutive
            currentSegment.end = seat.seatNumber;
          } else {
            // Start a new segment if there's a gap
            segments.push(currentSegment);
            currentSegment = { start: seat.seatNumber, end: seat.seatNumber };
          }
        });

        // Add the last segment
        if (currentSegment) {
          segments.push(currentSegment);
        }
      });

      return segments;
    },

    // Render a single seat
    renderSingleSeat(rowLabel, group) {
      const seatId = `${rowLabel}${group.startSeat}`;
      const seatElement = document.querySelector(`[data-seat-id="${seatId}"]`);

      if (seatElement) {
        // Mark as sold
        seatElement.classList.add("sold");

        // Store data as attributes
        seatElement.setAttribute("data-sf-id", group.recordIds[0] || "");
        seatElement.setAttribute("data-account", group.accountName);
        seatElement.setAttribute("data-event-type", group.event);
        seatElement.setAttribute("data-day", group.day);
        seatElement.setAttribute(
          "data-opportunity-id",
          group.opportunityId || ""
        );
      }
    },

    // Update seat details display
    updateSeatDetails() {
      const detailContent = document.getElementById("seat-detail-content");
      const selectedSeat = AppState.selectedSeat;

      if (!selectedSeat) {
        detailContent.innerHTML = "<p>Select a group to view details</p>";
        return;
      }

      let html = "";

      if (selectedSeat.isConnected) {
        // Connected seats details
        html += `<div class="detail-row"><span class="detail-label">Account:</span>${selectedSeat.accountName}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Row:</span>${selectedSeat.row}</div>`;

        let actualSeats = [];
        let seatRanges = "";
        let actualSeatCount = 0;

        // If this is a multi-segment booking (spanning across stairway or section)
        if (selectedSeat.isMultiSegment && selectedSeat.allSeatNumbers) {
          // Use the pre-calculated seat numbers
          actualSeats = selectedSeat.allSeatNumbers;
          actualSeatCount = actualSeats.length;

          // Format seat display (e.g., "38-39, 42-43" instead of "38-43")
          seatRanges = this.formatSeatRanges(actualSeats);
        }
        // For split groups that weren't handled by the click handler
        else if (
          selectedSeat.opportunityId &&
          document.querySelector(
            `.connected-seats[data-opportunity-id="${selectedSeat.opportunityId}"][data-split-group="true"]`
          )
        ) {
          // Find all connected seats with the same opportunity ID
          const allConnectedSeats = document.querySelectorAll(
            `.connected-seats[data-opportunity-id="${selectedSeat.opportunityId}"]`
          );

          // Collect all seat numbers from all segments
          const allSeatNumbers = [];

          allConnectedSeats.forEach((connectedSeat) => {
            const segmentRow = connectedSeat.getAttribute("data-row");

            // Only include segments from the same row
            if (segmentRow === selectedSeat.row) {
              const segmentStart = parseInt(
                connectedSeat.getAttribute("data-start-seat")
              );
              const segmentEnd = parseInt(
                connectedSeat.getAttribute("data-end-seat")
              );

              // Get actual seats for this segment (excluding pillars)
              const segmentSeats = this.getActualSeats(
                segmentRow,
                segmentStart,
                segmentEnd
              );
              allSeatNumbers.push(...segmentSeats);
            }
          });

          // Sort and deduplicate seat numbers
          actualSeats = [...new Set(allSeatNumbers)].sort((a, b) => a - b);
          actualSeatCount = actualSeats.length;

          // Format seat display (e.g., "38-39, 42-43" instead of "38-43")
          seatRanges = this.formatSeatRanges(actualSeats);
        } else {
          // Regular connected seats (not split)
          actualSeats = this.getActualSeats(
            selectedSeat.row,
            selectedSeat.startSeat,
            selectedSeat.endSeat
          );
          actualSeatCount = actualSeats.length;

          // Format seat display (e.g., "38-39, 42-43" instead of "38-43")
          seatRanges = this.formatSeatRanges(actualSeats);
        }

        html += `<div class="detail-row"><span class="detail-label">Seats:</span>${seatRanges} (${actualSeatCount} seats)</div>`;
        html += `<div class="detail-row"><span class="detail-label">Day:</span>${selectedSeat.day}</div>`;
        html += `<div class="detail-row"><span class="detail-label">Event Type:</span>${selectedSeat.eventType}</div>`;

        if (selectedSeat.opportunityId) {
          html += `<div class="detail-row"><span class="detail-label">Opportunity ID:</span>${selectedSeat.opportunityId}</div>`;
        }
      }

      detailContent.innerHTML = html;
    },
  };

  // ===== APPLICATION INITIALIZATION =====
  // Initialize the application
  function initializeApp() {
    Logger.log(
      "Initializing application with SALESFORCE_DATA:",
      SALESFORCE_DATA
    );

    // Show loading indicator
    const loadingEl = document.createElement("div");
    loadingEl.className = "loading-indicator";
    loadingEl.textContent = "Loading seat data...";
    document.body.appendChild(loadingEl);

    // Use setTimeout to allow the UI to render the loading indicator
    setTimeout(() => {
      try {
        // Initialize state with data
        AppState.initialize(SALESFORCE_DATA);

        // Initialize UI
        UI.initialize();

        // Add observer for seat details updates
        AppState.addObserver(function (state) {
          UI.updateSeatDetails();
        });

        // Add observer for updating the seating map
        AppState.addObserver(function (state) {
          UI.updateSeatingMap();
        });

        // Hide loading indicator
        loadingEl.style.display = "none";
      } catch (error) {
        Logger.error("Error initializing application:", error);
        loadingEl.textContent =
          "Error loading seat data. Please refresh the page.";
        loadingEl.style.backgroundColor = "#f44336";
      }
    }, 0);
  }

  // Start the application
  initializeApp();
});

/**
 * LWC Migration Notes:
 *
 * When migrating to Salesforce LWC, consider the following:
 *
 * 1. Convert the DataService, AppState, and UI modules to LWC components
 * 2. Use @track decorators for reactive properties
 * 3. Use @wire to fetch data from Apex
 * 4. Replace DOM manipulation with LWC templates
 * 5. Use Lightning Base Components for UI elements
 *
 * Example LWC structure:
 *
 * import { LightningElement, wire, track } from 'lwc';
 * import getSeatData from '@salesforce/apex/SeatMapController.getSeatData';
 *
 * export default class SeatMap extends LightningElement {
 *     @track selectedDay = '';
 *     @track selectedEvent = 'Rodeo';
 *     @track processedData = [];
 *
 *     // Wire adapter to get data from Apex
 *     @wire(getSeatData, { day: '$selectedDay', eventType: '$selectedEvent' })
 *     wiredSeatData({ error, data }) {
 *         if (data) {
 *             // Process the data for display
 *             this.processedData = this.processConnectedSeats(
 *                 this.transformSalesforceData(data)
 *             );
 *         } else if (error) {
 *             console.error('Error loading seat data', error);
 *         }
 *     }
 * }
 */
