var name; // our username
var modalIndex = 0; // for modals to have unique id's
var activeChannel = "g"; // for chat

// connecting to our signaling server
var conn = new WebSocket('ws://' + window.location.hostname + ':9090');

conn.onopen = function() {
    console.log("Connected to the signaling server");
};

// using Google public stun server
var servers = {
	"iceServers": [{ "url": "stun:stun2.1.google.com:19302" }]
};

var peerConns = {};
var stream;

// for browser compability
navigator.getUserMedia = (navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia ||
	navigator.msGetUserMedia);
RTCPeerConnection = (RTCPeerConnection ||
	webkitRTCPeerConnection ||
	mozRTCPeerConnection ||
	msRTCPeerConnection);

$("#checkUsersBtn").click(function(e) {
	send({type: "users"});
});

$("#screenSharingBtn").click(function(e) {
if(navigator.userAgent.indexOf("Chrome") != -1 ) {
	const EXTENSION_ID = 'fgjelceahkekhhhdafgbhinlijokelgf';

	chrome.runtime.sendMessage(EXTENSION_ID, 'version', response => {
		if (!response) {
			console.log('No extension');
			return;
		}
		console.log('Extension version: ', response.version);    
		const request = { sources: ['window', 'screen', 'tab'] };
		chrome.runtime.sendMessage(EXTENSION_ID, request, response => {
			if (response && response.type === 'success') {
				navigator.mediaDevices.getUserMedia({
					video: {
						mandatory: {
							chromeMediaSource: 'desktop',
							chromeMediaSourceId: response.streamId
						}
					}
				}).then(returnedStream => {
					changeStream(returnedStream);		
				}).catch(err => {
					console.error('Could not get stream: ', err);
				});
			} else {
				console.error('Could not get stream');
			}
		});
	}); 
	}
	if(navigator.userAgent.indexOf("Firefox") != -1 ) {
         console.log("Firefox");
		 navigator.mediaDevices.getUserMedia({
        video: {
          mediaSource: 'window'
        }
      })
      .then(returnedStream => {
        changeStream(returnedStream);
      })
      .catch(err => {
        console.error('Could not get stream: ', err);
      });
	}
});

$("#cameraSharingBtn").click(function(e) {
	navigator.getUserMedia({ video: true, audio: true }, function(myStream) {
			changeStream(myStream);
			
		}, function (error) {
			console.log(error);
		});
});

function changeStream(newStream) {
	$("#localVideo").attr("src", window.URL.createObjectURL(newStream));
	$("#localVideo")[0].load();
	for(var i in peerConns)	{
		console.log('peerConns: ' + i);
		if(navigator.userAgent.indexOf("Chrome") != -1) peerConns[i].removeStream(stream);
		peerConns[i].addStream(newStream);
		handleAccept(i);
	}
	stream = newStream;
}

function addVideoDiv(name) {
	$("#"+name+".remoteVideo").parent().remove();
	$("#videoDiv").append('<div class="p-2 w-50 border">'+name+'<button type="button" class="close" aria-label="Close"><span aria-hidden="true">×</span></button><video controls id = "'+name+'" class="remoteVideo" autoplay></video></div>');
	$("#"+name+".remoteVideo").parent().find(".close").click(function(e) {
		e.preventDefault();
		send({
			type: "leave",
			name: name
		});
		endPeerConn(name);
	});
}

function changeChannel(channel) {
	$("#chatAreaDiv ."+activeChannel).css("display", "none");
	activeChannel = channel;
	$("#channelName").text(activeChannel);
	$("#chatForm :text").focus();
	if ($("#channelList > :contains("+activeChannel+")").length == 0) {
		$("#chatAreaDiv").append('<table class="table-hover table '+activeChannel+'" style="display: block"><tbody class="chatArea"></tbody></table>');
		$("#channelList").append('<a class="dropdown-item" href="#">'+activeChannel+'</a>').click(function(e) {
			e.preventDefault();
			changeChannel(e.target.innerHTML);
		});
	}
	else $("#chatAreaDiv ."+activeChannel).css("display", "block");
	$("#chatAreaDiv").scrollTop($("#chatAreaDiv ."+activeChannel).height());
}

$("#chatForm").submit(function(e) {
	e.preventDefault();
	var msg = $("input[name='message']").val();
	$("input[name='message']").val("");
	send({
		type: "message",
		message: msg,
		name: activeChannel
	});
	$("#chatAreaDiv ."+activeChannel)
		.append($("<tr>")
			.append($("<td>")
				.append(document.createTextNode(name + ": " + msg))
			)
		);
	$("#chatAreaDiv").scrollTop($("#chatAreaDiv ."+activeChannel).height());
});

// when user list gets refreshed
function onUsersRefresh(users) {
	$("#userList").empty();
	users.sort();
	for (var i = 0; i < users.length; i++) {
		$("#userList")
			.append($("<tr>")
				.append($("<td>")
					.append(document.createTextNode(users[i]))
				)
			);
	}
	$("#userList > tr").click(function(e) {
		e.preventDefault();
		var targetUser = e.target.innerHTML;
		load("modalTwoB.html", $("body"), function() {
			var modal = $("#modalTwoB").attr("id", "#modal" + modalIndex++);
			modal.find(".modal-title").text("Select action");
			modal.find(".modal-body").text("Do you want to call or message this user?");
			modal.find(".btn-secondary").text("Call");
			modal.find(".btn-secondary").click(function(e) {
				if (targetUser.length > 0) {
					send({
						type: "permission",
						name: targetUser
					});
				}
				modal.modal("hide");
			});
			modal.find(".btn-primary").text("Message");
			modal.find(".btn-primary").click(function(e) {
				changeChannel(targetUser);
				modal.modal("hide");
			});
			modal.on("hidden.bs.modal", function(e) {
				modal.remove();
			})
			modal.modal("show");
		});
	});
}

conn.onerror = function(err) {
    console.log("Got error", err);
};

// alias for sending JSON encoded messages
function send(message) {
    conn.send(JSON.stringify(message));
};

// when we got a message from a signaling server
conn.onmessage = function(msg) {
    console.log("Got message", msg.data);

    var data = JSON.parse(msg.data);

    switch(data.type) {
		case "users":
			onUsersRefresh(data.users);
			break;
        case "login":
            handleLogin(data.success);
            break;
		case "message":
			handleMessage(data.message, data.sender, data.channel);
			break;
        // when somebody wants to call us
        case "offer":
            handleOffer(data.offer, data.name);
            break;
        case "answer":
            handleAnswer(data.answer, data.name);
            break;
		case "permission":
			handlePermission(data.name);
			break;
		case "accept":
			handleAccept(data.name);
			break;
		case "decline":
			handleDecline(data.name);
			break;
        // when a remote peer sends an ice candidate to us
        case "candidate":
            handleCandidate(data.candidate, data.name);
            break;
        case "leave":
            handleLeave(data.name);
            break;
        default:
            break;
    }
};
	
function handleAccept(name) {
	if (!peerConns.hasOwnProperty(name)) {
		addVideoDiv(name);
		$("#"+name+".remoteVideo").parent().hide();
	
		peerConns[name] = new RTCPeerConnection(servers);
	
		// setup stream listening
		peerConns[name].addStream(stream);
		
		// when a remote user adds stream to the peer connection, we display it
		peerConns[name].onaddstream = function(e) {
			var video = $("#"+name+".remoteVideo");
			video.attr("src", window.URL.createObjectURL(e.stream));
			video[0].load();
			$("#"+name+".remoteVideo").parent().show();
		};

		// setup ice handling
		peerConns[name].onicecandidate = function(e) {
			if (e.candidate) {
				send({
					type: "candidate",
					candidate: e.candidate,
					name: name
				});
			}
		};
	}
	
	//create an offer
	peerConns[name].createOffer(function(offer) {
		send({
			type: "offer",
			offer: offer,
			name: name
		});
		peerConns[name].setLocalDescription(offer);
	}, function(error) {
		console.log("Error when creating an offer");
	});
}

function handleOffer(offer, name) {	
	if (!peerConns.hasOwnProperty(name)) {	
		addVideoDiv(name);
		$("#"+name+".remoteVideo").parent().hide();
		
		peerConns[name] = new RTCPeerConnection(servers);
	
		// setup stream listening
		peerConns[name].addStream(stream);
		
		// when a remote user adds stream to the peer connection, we display it
		peerConns[name].onaddstream = function(e) {
			var video = $("#"+name+".remoteVideo");
			video.attr("src", window.URL.createObjectURL(e.stream));
			video[0].load();
			$("#"+name+".remoteVideo").parent().show();
		};
		
		// setup ice handling
		peerConns[name].onicecandidate = function(e) {
			if (e.candidate) {
				send({
					type: "candidate",
					candidate: e.candidate,
					name: name
				});
			}
		};
	}
	
	peerConns[name].setRemoteDescription(new RTCSessionDescription(offer));

	// create an answer to an offer
	peerConns[name].createAnswer(function (answer) {
		peerConns[name].setLocalDescription(answer);
		
		send({
			type: "answer",
			answer: answer,
			name: name
		});
		
	}, function(error) {
		console.log("Error when creating an answer");
	});
}

function endPeerConn(name) {
    $("#"+name+".remoteVideo").parent().remove();
    peerConns[name].close();
	delete peerConns[name];
}

$("#loginForm").submit(function(e) {
	e.preventDefault();
	name = $("#loginForm :text").val();

	send({
		type: "login",
		name: name
	});
});
$("#loginForm :text").popover("disable");

function handleLogin(success) {
    if (success === false) {
		$("#loginForm :text").popover("enable").popover("show").popover("disable");
		setTimeout(function() {
			$("#loginForm :text").popover("hide");
		}, 1500);
		
    } else {
		$(".dropdown-item > :contains(text(g)").click(function(e) {
			e.preventDefault();
			changeChannel(e.target.innerHTML);
		});
		
		send({type: "users"});
		// ping server for user list every 30s
		setInterval(function() {
			send({type: "users"});
		}, 30000);
		
        $("#loginPage").css("display", "none");
        $("#callPage").css("display", "block");
		resize();
		
		// getting local video stream
		navigator.getUserMedia({ video: true, audio: true }, function(myStream) {
			stream = myStream;
			
			$("#videoDiv").append('<div class="p-2 w-50 border">You<video controls muted id="localVideo" autoplay></video></div>');
			// displaying local video stream on the page
			$("#localVideo").attr("src", window.URL.createObjectURL(stream));
			$("#localVideo")[0].load();
		}, function (error) {
			console.log(error);
		});
    }
};

function handleMessage(message, sender, channel) {
	if ($("#channelList > :contains("+channel+")").length == 0) {
		$("#chatAreaDiv").append('<table class="table-hover table '+channel+'" style="display: none"><tbody class="chatArea"></tbody></table>');
		$("#channelList").append('<a class="dropdown-item" href="#">'+channel+'</a>').click(function(e) {
			e.preventDefault();
			changeChannel(e.target.innerHTML);
		});
	}
	$("#chatAreaDiv ."+channel)
		.append($("<tr>")
			.append($("<td>")
				.append(document.createTextNode(sender + ": " + message))
			)
		);
	if (channel === activeChannel) $("#chatAreaDiv").scrollTop($("#chatAreaDiv ."+activeChannel).height());
}

// when somebody sends us an offer
function handlePermission(name) {
	load("modalTwoB.html", $("body"), function() {
		var modal = $("#modalTwoB").attr("id", "#modal" + modalIndex++);
		modal.find(".modal-title").text("Incoming call");
		modal.find(".modal-body").text("From \"" + name + "\"");
		modal.find(".btn-secondary").text("Decline");
		modal.find(".btn-secondary").click(function(e) {modal.modal("hide");});
		modal.find(".btn-primary").text("Accept");
		modal.find(".btn-primary").click(function(e) {
			modal.off("hide.bs.modal .decline");
			send({
				type: "accept",
				name: name
			});
			modal.modal("hide");
		});
		modal.on("hide.bs.modal .decline", function(e) {
			send({
				type: "decline",
				name: name
			});
		})
		modal.on("hidden.bs.modal", function(e) {
			modal.remove();
		})
		modal.modal("show");
	});
};

function handleDecline(name) {
	load("modalOneB.html", $("body"), function() {
		var modal = $("#modalOneB").attr("id", "#modal" + modalIndex++);
		modal.find(".modal-title").text("Call declined");
		modal.find(".modal-body").text("User \"" + name + "\" declined your call");
		modal.find(".btn-secondary").text("OK");
		modal.on("hidden.bs.modal", function(e) {
			modal.remove();
		})
		modal.modal("show");
	});
}

// when we got an answer from a remote user
function handleAnswer(answer, name) {
	if (!peerConns.hasOwnProperty(name)) peerConns[name] = new RTCPeerConnection(servers);
    peerConns[name].setRemoteDescription(new RTCSessionDescription(answer));
};

// when we got an ice candidate from a remote user
function handleCandidate(candidate, name) {
	if (!peerConns.hasOwnProperty(name)) peerConns[name] = new RTCPeerConnection(servers);
    peerConns[name].addIceCandidate(new RTCIceCandidate(candidate));
};

function handleLeave(name) {
	endPeerConn(name);
};

function resize() {
	$("#userListDiv").height($("#row1").outerHeight() - $("#userListHeader").outerHeight() - $("#checkUsersBtn").outerHeight());
	$("#chatAreaDiv").height($("#row1").outerHeight() - $("#chatHeader").outerHeight() - $("#chatForm").outerHeight());
}
$(window).resize(function() {
	resize();
});