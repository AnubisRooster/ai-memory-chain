// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AIMemoryStorage {
    struct Memory {
        string summary;
        uint256 timestamp;
        string ipfsCID;
        bytes32 sha256Hash;
        int16[] embedding;
        address author;
    }

    Memory[] private memories;

    event MemoryStored(
        uint256 indexed id,
        address indexed author,
        string ipfsCID,
        bytes32 sha256Hash,
        uint256 timestamp
    );

    function storeMemory(
        string calldata _summary,
        string calldata _ipfsCID,
        bytes32 _sha256Hash,
        int16[] calldata _embedding
    ) external returns (uint256) {
        uint256 id = memories.length;

        memories.push(
            Memory({
                summary: _summary,
                timestamp: block.timestamp,
                ipfsCID: _ipfsCID,
                sha256Hash: _sha256Hash,
                embedding: _embedding,
                author: msg.sender
            })
        );

        emit MemoryStored(id, msg.sender, _ipfsCID, _sha256Hash, block.timestamp);
        return id;
    }

    function getMemory(uint256 _id)
        external
        view
        returns (
            string memory summary,
            uint256 timestamp,
            string memory ipfsCID,
            bytes32 sha256Hash,
            int16[] memory embedding,
            address author
        )
    {
        require(_id < memories.length, "Memory does not exist");
        Memory storage m = memories[_id];
        return (m.summary, m.timestamp, m.ipfsCID, m.sha256Hash, m.embedding, m.author);
    }

    function getMemoryCount() external view returns (uint256) {
        return memories.length;
    }

    function getMemorySummary(uint256 _id) external view returns (string memory, uint256) {
        require(_id < memories.length, "Memory does not exist");
        return (memories[_id].summary, memories[_id].timestamp);
    }
}
